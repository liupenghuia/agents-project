# frozen_string_literal: true

require "date"
require "fileutils"
require "json"
require "pathname"
require "securerandom"
require "time"
require "yaml"

# Append-only multi-agent run store: run header + events.jsonl + summary projection.
module AgentRuntime
  SCHEMA_VERSION = 1
  GRAPH_ID = "delivery-v1"

  EVENT_TYPES = %w[
    run.started run.completed run.blocked run.failed run.cancelled
    node.entered node.exited
    message.handoff
    tool.called tool.finished
    gate.evaluated check.finished
    repair.started repair.finished
    interrupt.requested human.decision
    run.checkpointed note
  ].freeze

  RUN_STATUSES = %w[running completed blocked failed cancelled].freeze
  MODES = %w[delivery manual repair].freeze

  module_function

  def root
    Pathname(ENV.fetch("AGENT_RUNS_DIR", File.expand_path("../../.agent-runs", __dir__)))
  end

  def repo_root
    Pathname(File.expand_path("../..", __dir__))
  end

  def graph_path
    repo_root.join("docs", "agent-graph.yaml")
  end

  def load_graph
    return default_graph unless graph_path.file?

    data = YAML.safe_load(graph_path.read, permitted_classes: [], aliases: false) || {}
    {
      "id" => data["id"] || GRAPH_ID,
      "nodes" => Array(data["nodes"]).map { |node| node["id"].to_s },
      "labels" => Array(data["nodes"]).each_with_object({}) { |node, memo| memo[node["id"].to_s] = node["label"].to_s },
    }
  rescue StandardError
    default_graph
  end

  def default_graph
    {
      "id" => GRAPH_ID,
      "nodes" => %w[
        discover product_gate architect architecture_gate design design_gate
        backend frontend_coord miniprogram web mobile ios android
        implementation_gate test fix release_gate verify repair human_approval done
      ],
      "labels" => {},
    }
  end

  def known_node?(node)
    return true if node.nil? || node.to_s.strip.empty?

    load_graph["nodes"].include?(node.to_s)
  end

  def ensure_root!
    FileUtils.mkdir_p(root)
  end

  def run_dir(run_id)
    root.join(run_id)
  end

  def new_run_id
    "run-#{Time.now.utc.strftime('%Y%m%d-%H%M%S')}-#{SecureRandom.hex(3)}"
  end

  def new_event_id
    "evt_#{SecureRandom.hex(8)}"
  end

  def now_iso
    Time.now.utc.iso8601
  end

  def read_json(path)
    JSON.parse(File.read(path))
  end

  def write_json(path, data)
    File.write(path, JSON.pretty_generate(data) + "\n")
  end

  def resolve_task(task_name_or_id)
    return empty_task_ref(task_name_or_id) if task_name_or_id.nil? || task_name_or_id.to_s.strip.empty?

    key = task_name_or_id.to_s.strip
    tasks_dir = repo_root.join("tasks")
    direct = tasks_dir.join("#{key}.md")
    if direct.file?
      meta = front_matter(direct)
      return {
        "task_id" => meta["id"] || key,
        "task_file" => relative_to_repo(direct),
        "title" => meta["title"],
        "task_status" => meta["status"],
      }
    end

    Dir[tasks_dir.join("*.md").to_s].each do |path|
      next if File.basename(path) == "template.md"

      meta = front_matter(Pathname(path))
      if meta["id"].to_s == key || meta["title"].to_s.strip == key
        return {
          "task_id" => meta["id"] || key,
          "task_file" => relative_to_repo(path),
          "title" => meta["title"],
          "task_status" => meta["status"],
        }
      end
    end

    empty_task_ref(key)
  end

  def empty_task_ref(key)
    {
      "task_id" => key.to_s,
      "task_file" => nil,
      "title" => nil,
      "task_status" => nil,
    }
  end

  def front_matter(path)
    text = File.read(path)
    match = text.match(/\A---\n(.*?)\n---\n/m)
    return {} unless match

    YAML.safe_load(match[1], permitted_classes: [Date], aliases: false) || {}
  rescue StandardError
    {}
  end

  def relative_to_repo(path)
    Pathname(path).expand_path.relative_path_from(repo_root).to_s
  rescue ArgumentError
    path.to_s
  end

  def start_run(task:, mode: "manual", actor: "Orchestrator Agent", parent_run_id: nil, delivery_run_dir: nil, metadata: {})
    raise ArgumentError, "invalid mode #{mode}" unless MODES.include?(mode.to_s)

    ensure_root!
    task_ref = resolve_task(task)
    run_id = new_run_id
    created = now_iso
    header = {
      "schema_version" => SCHEMA_VERSION,
      "run_id" => run_id,
      "task_id" => task_ref["task_id"],
      "task_file" => task_ref["task_file"],
      "task_title" => task_ref["title"],
      "graph" => load_graph["id"],
      "status" => "running",
      "mode" => mode.to_s,
      "created_at" => created,
      "updated_at" => created,
      "actors" => [actor.to_s],
      "active_node" => nil,
      "parent_run_id" => parent_run_id,
      "delivery_run_dir" => delivery_run_dir,
      "metadata" => metadata || {},
    }

    dir = run_dir(run_id)
    FileUtils.mkdir_p(dir)
    write_json(dir.join("run.json"), header)
    FileUtils.touch(dir.join("events.jsonl"))

    emit(
      run_id,
      type: "run.started",
      actor: actor,
      payload: {
        "mode" => mode.to_s,
        "parent_run_id" => parent_run_id,
        "task_file" => task_ref["task_file"],
        "task_title" => task_ref["title"],
      }.compact
    )

    touch_index(header)
    header
  end

  def load_run(run_id)
    path = run_dir(run_id).join("run.json")
    raise ArgumentError, "unknown run: #{run_id}" unless path.file?

    read_json(path)
  end

  def save_run(header)
    write_json(run_dir(header["run_id"]).join("run.json"), header)
    touch_index(header)
    header
  end

  def events(run_id)
    path = run_dir(run_id).join("events.jsonl")
    return [] unless path.file?

    path.each_line.map do |line|
      line = line.strip
      next if line.empty?

      JSON.parse(line)
    end.compact
  end

  def emit(run_id, type:, actor:, payload: {}, node: nil, task_id: nil)
    raise ArgumentError, "unknown event type: #{type}" unless EVENT_TYPES.include?(type.to_s)

    header = load_run(run_id)
    node_id = node&.to_s
    raise ArgumentError, "unknown graph node: #{node_id}" if node_id && !node_id.empty? && !known_node?(node_id)

    event = {
      "schema_version" => SCHEMA_VERSION,
      "event_id" => new_event_id,
      "run_id" => run_id,
      "ts" => now_iso,
      "type" => type.to_s,
      "actor" => actor.to_s,
      "task_id" => task_id || header["task_id"],
      "node" => node_id && !node_id.empty? ? node_id : nil,
      "payload" => stringify_keys(payload || {}),
    }

    File.open(run_dir(run_id).join("events.jsonl"), "a") { |io| io.puts(JSON.generate(event)) }

    actors = Array(header["actors"])
    actors << actor.to_s unless actors.include?(actor.to_s)
    header["actors"] = actors
    header["updated_at"] = event["ts"]
    header["active_node"] = node_id if type.to_s == "node.entered" && node_id
    header["active_node"] = nil if type.to_s == "node.exited"

    case type.to_s
    when "run.completed"
      header["status"] = "completed"
    when "run.blocked", "interrupt.requested"
      header["status"] = "blocked"
    when "run.failed"
      header["status"] = "failed"
    when "run.cancelled"
      header["status"] = "cancelled"
    when "human.decision"
      header["status"] = "running" if header["status"] == "blocked"
    end

    if type.to_s == "run.started" && payload.is_a?(Hash) && payload["delivery_run_dir"]
      header["delivery_run_dir"] = payload["delivery_run_dir"]
    end

    save_run(header)
    write_summary(run_id)
    event
  end

  def handoff(run_id, from_actor:, to_actor:, from_status:, to_status:, actor: nil, evidence: nil, next_action: nil, changed_files: [], issues: [], node: nil)
    payload = {
      "from_actor" => from_actor.to_s,
      "to_actor" => to_actor.to_s,
      "from_status" => from_status.to_s,
      "to_status" => to_status.to_s,
      "evidence" => evidence,
      "next_action" => next_action,
      "changed_files" => Array(changed_files).map(&:to_s),
      "issues" => Array(issues).map(&:to_s),
    }.compact

    event = emit(
      run_id,
      type: "message.handoff",
      actor: actor || from_actor,
      node: node,
      payload: payload
    )

    {
      "event" => event,
      "markdown_row" => handoff_markdown_row(
        ts: event["ts"],
        actor: from_actor,
        target: to_actor,
        from_status: from_status,
        to_status: to_status,
        changed_files: changed_files,
        evidence: evidence,
        issues: issues,
        next_action: next_action
      ),
    }
  end

  def handoff_markdown_row(ts:, actor:, target:, from_status:, to_status:, changed_files: [], evidence: nil, issues: [], next_action: nil)
    date = begin
      Time.parse(ts.to_s).utc.strftime("%Y-%m-%d")
    rescue StandardError
      ts.to_s[0, 10]
    end
    files = Array(changed_files).empty? ? "-" : Array(changed_files).join(", ")
    issue_text = Array(issues).empty? ? "-" : Array(issues).join(", ")
    "| #{date} | #{actor} | #{target} | #{from_status} | #{to_status} | #{files} | #{evidence || '-'} | #{issue_text} | #{next_action || '-'} |"
  end

  def interrupt!(run_id, reason:, options:, actor: "Orchestrator Agent", risk: nil, node: "human_approval")
    opts = Array(options).map { |item| item.to_s.strip }.reject(&:empty?)
    raise ArgumentError, "interrupt requires at least one option" if opts.empty?

    emit(
      run_id,
      type: "interrupt.requested",
      actor: actor,
      node: node,
      payload: {
        "reason" => reason.to_s,
        "options" => opts,
        "risk" => risk,
      }.compact
    )
  end

  def decide!(run_id, decision:, by:, note: nil, actor: nil)
    emit(
      run_id,
      type: "human.decision",
      actor: actor || by,
      node: "human_approval",
      payload: {
        "decision" => decision.to_s,
        "by" => by.to_s,
        "note" => note,
      }.compact
    )
  end

  def checkpoint!(run_id, ref:, actor: "Orchestrator Agent", note: nil)
    emit(
      run_id,
      type: "run.checkpointed",
      actor: actor,
      payload: {
        "ref" => ref.to_s,
        "note" => note,
      }.compact
    )
  end

  def complete!(run_id, result:, actor: "Orchestrator Agent", summary: nil)
    emit(
      run_id,
      type: "run.completed",
      actor: actor,
      node: "done",
      payload: {
        "result" => result.to_s,
        "summary" => summary,
      }.compact
    )
  end

  def block!(run_id, reason:, unblock_condition:, owner: nil, actor: "Orchestrator Agent")
    emit(
      run_id,
      type: "run.blocked",
      actor: actor,
      node: "human_approval",
      payload: {
        "reason" => reason.to_s,
        "unblock_condition" => unblock_condition.to_s,
        "owner" => owner,
      }.compact
    )
  end

  def list_runs(task_id: nil, limit: 20)
    ensure_root!
    headers = Dir[root.join("run-*/run.json").to_s].map do |path|
      begin
        read_json(path)
      rescue StandardError
        nil
      end
    end.compact
    headers.select! { |header| header["task_id"].to_s == task_id.to_s } if task_id && !task_id.to_s.empty?
    headers.sort_by { |header| header["updated_at"].to_s }.reverse.first(limit)
  end

  def timeline_lines(run_id)
    header = load_run(run_id)
    labels = load_graph["labels"]
    lines = []
    lines << "# Run #{run_id}"
    lines << ""
    lines << "- Task: `#{header['task_id']}`#{" (#{header['task_title']})" if header['task_title']}"
    lines << "- Status: **#{header['status']}**"
    lines << "- Mode: `#{header['mode']}`"
    lines << "- Graph: `#{header['graph']}`"
    lines << "- Created: #{header['created_at']}"
    lines << "- Updated: #{header['updated_at']}"
    lines << "- Actors: #{Array(header['actors']).join(', ')}"
    lines << "- Active node: `#{header['active_node'] || '—'}`"
    lines << "- Delivery artifacts: `#{header['delivery_run_dir']}`" if header["delivery_run_dir"]
    lines << ""
    lines << "## Timeline"
    lines << ""

    events(run_id).each do |event|
      node = event["node"]
      node_label = node ? (labels[node] || node) : nil
      prefix = node_label ? "[#{node_label}] " : ""
      payload = event["payload"] || {}
      detail = case event["type"]
               when "message.handoff"
                 "#{payload['from_actor']} → #{payload['to_actor']} (#{payload['from_status']} → #{payload['to_status']})"
               when "tool.finished", "check.finished"
                 ok = payload["success"] ? "PASS" : "FAIL"
                 "`#{payload['label'] || payload['tool']}` #{ok} #{payload['command']}"
               when "gate.evaluated"
                 "#{payload['gate']}: #{payload['result']}"
               when "interrupt.requested"
                 "INTERRUPT: #{payload['reason']} options=#{Array(payload['options']).join('|')}"
               when "human.decision"
                 "DECISION: #{payload['decision']} by #{payload['by']}"
               when "run.completed"
                 "result=#{payload['result']}"
               when "run.blocked"
                 "blocked: #{payload['reason']}"
               when "node.entered", "node.exited"
                 event["type"].sub("node.", "")
               else
                 payload.empty? ? event["type"] : "#{event['type']} #{payload.map { |k, v| "#{k}=#{v}" }.join(' ')}"
               end
      lines << "- `#{event['ts']}` · **#{event['actor']}** · #{prefix}#{detail}"
    end

    lines << ""
    lines << "## Graph nodes (reference)"
    lines << ""
    load_graph["nodes"].each do |node_id|
      mark = header["active_node"] == node_id ? "← active" : ""
      label = labels[node_id] || node_id
      lines << "- `#{node_id}` — #{label} #{mark}".rstrip
    end
    lines
  end

  def write_summary(run_id)
    path = run_dir(run_id).join("summary.md")
    path.write(timeline_lines(run_id).join("\n") + "\n")
    path
  end

  def format_show(run_id)
    timeline_lines(run_id).join("\n")
  end

  def touch_index(header)
    ensure_root!
    index_path = root.join("index.json")
    index = if index_path.file?
              read_json(index_path)
            else
              { "schema_version" => SCHEMA_VERSION, "runs" => [] }
            end
    runs = Array(index["runs"]).reject { |item| item["run_id"] == header["run_id"] }
    runs.unshift(
      {
        "run_id" => header["run_id"],
        "task_id" => header["task_id"],
        "status" => header["status"],
        "mode" => header["mode"],
        "updated_at" => header["updated_at"],
      }
    )
    index["runs"] = runs.first(100)
    index["schema_version"] = SCHEMA_VERSION
    write_json(index_path, index)
  end

  def stringify_keys(value)
    case value
    when Hash
      value.each_with_object({}) { |(key, nested), memo| memo[key.to_s] = stringify_keys(nested) }
    when Array
      value.map { |item| stringify_keys(item) }
    else
      value
    end
  end
end
