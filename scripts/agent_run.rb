#!/usr/bin/env ruby
# frozen_string_literal: true

require "optparse"
require_relative "lib/agent_runtime"

def usage
  <<~TEXT
    Usage:
      ruby scripts/agent_run.rb start --task TASK [--mode manual|delivery|repair] [--actor NAME]
      ruby scripts/agent_run.rb emit --run RUN_ID --type TYPE --actor NAME [--node NODE] [--payload JSON]
      ruby scripts/agent_run.rb handoff --run RUN_ID --from A --to B --from-status S --to-status T [options]
      ruby scripts/agent_run.rb interrupt --run RUN_ID --reason TEXT --options a,b,c [--risk LEVEL]
      ruby scripts/agent_run.rb decide --run RUN_ID --decision DECISION --by WHO [--note TEXT]
      ruby scripts/agent_run.rb checkpoint --run RUN_ID --ref REF [--note TEXT]
      ruby scripts/agent_run.rb complete --run RUN_ID --result passed|failed [--summary TEXT]
      ruby scripts/agent_run.rb block --run RUN_ID --reason TEXT --unblock TEXT [--owner NAME]
      ruby scripts/agent_run.rb list [--task TASK_ID] [--limit N]
      ruby scripts/agent_run.rb show RUN_ID
      ruby scripts/agent_run.rb timeline RUN_ID

    Runs are stored under .agent-runs/ (override with AGENT_RUNS_DIR).
    See docs/agent-runtime.md.
  TEXT
end

command = ARGV.shift
abort usage if command.nil? || %w[-h --help help].include?(command)

case command
when "start"
  options = { mode: "manual", actor: "Orchestrator Agent" }
  parser = OptionParser.new do |opts|
    opts.on("--task TASK", String) { |value| options[:task] = value }
    opts.on("--mode MODE", String) { |value| options[:mode] = value }
    opts.on("--actor NAME", String) { |value| options[:actor] = value }
    opts.on("--parent RUN_ID", String) { |value| options[:parent] = value }
    opts.on("--delivery-dir PATH", String) { |value| options[:delivery_dir] = value }
  end
  parser.parse!
  abort "start requires --task" unless options[:task]
  header = AgentRuntime.start_run(
    task: options[:task],
    mode: options[:mode],
    actor: options[:actor],
    parent_run_id: options[:parent],
    delivery_run_dir: options[:delivery_dir]
  )
  puts header["run_id"]
  puts "task=#{header['task_id']} status=#{header['status']} mode=#{header['mode']}"
  puts "dir=#{AgentRuntime.run_dir(header['run_id'])}"

when "emit"
  options = { payload: {} }
  parser = OptionParser.new do |opts|
    opts.on("--run RUN_ID", String) { |value| options[:run] = value }
    opts.on("--type TYPE", String) { |value| options[:type] = value }
    opts.on("--actor NAME", String) { |value| options[:actor] = value }
    opts.on("--node NODE", String) { |value| options[:node] = value }
    opts.on("--payload JSON", String) { |value| options[:payload] = JSON.parse(value) }
  end
  parser.parse!
  abort "emit requires --run --type --actor" unless options[:run] && options[:type] && options[:actor]
  event = AgentRuntime.emit(
    options[:run],
    type: options[:type],
    actor: options[:actor],
    node: options[:node],
    payload: options[:payload]
  )
  puts event["event_id"]

when "handoff"
  options = { changed_files: [], issues: [] }
  parser = OptionParser.new do |opts|
    opts.on("--run RUN_ID", String) { |value| options[:run] = value }
    opts.on("--from NAME", String) { |value| options[:from] = value }
    opts.on("--to NAME", String) { |value| options[:to] = value }
    opts.on("--from-status STATUS", String) { |value| options[:from_status] = value }
    opts.on("--to-status STATUS", String) { |value| options[:to_status] = value }
    opts.on("--evidence TEXT", String) { |value| options[:evidence] = value }
    opts.on("--next TEXT", String) { |value| options[:next] = value }
    opts.on("--files LIST", String) { |value| options[:changed_files] = value.split(",").map(&:strip) }
    opts.on("--issues LIST", String) { |value| options[:issues] = value.split(",").map(&:strip) }
    opts.on("--node NODE", String) { |value| options[:node] = value }
    opts.on("--actor NAME", String) { |value| options[:actor] = value }
  end
  parser.parse!
  missing = %i[run from to from_status to_status].select { |key| options[key].to_s.empty? }
  abort "handoff missing: #{missing.join(', ')}" unless missing.empty?
  result = AgentRuntime.handoff(
    options[:run],
    from_actor: options[:from],
    to_actor: options[:to],
    from_status: options[:from_status],
    to_status: options[:to_status],
    actor: options[:actor],
    evidence: options[:evidence],
    next_action: options[:next],
    changed_files: options[:changed_files],
    issues: options[:issues],
    node: options[:node]
  )
  puts result["event"]["event_id"]
  puts result["markdown_row"]

when "interrupt"
  options = { actor: "Orchestrator Agent", options: [] }
  parser = OptionParser.new do |opts|
    opts.on("--run RUN_ID", String) { |value| options[:run] = value }
    opts.on("--reason TEXT", String) { |value| options[:reason] = value }
    opts.on("--options LIST", String) { |value| options[:options] = value.split(",").map(&:strip) }
    opts.on("--risk LEVEL", String) { |value| options[:risk] = value }
    opts.on("--actor NAME", String) { |value| options[:actor] = value }
    opts.on("--node NODE", String) { |value| options[:node] = value }
  end
  parser.parse!
  abort "interrupt requires --run --reason --options" unless options[:run] && options[:reason] && !options[:options].empty?
  event = AgentRuntime.interrupt!(
    options[:run],
    reason: options[:reason],
    options: options[:options],
    actor: options[:actor],
    risk: options[:risk],
    node: options[:node] || "human_approval"
  )
  puts event["event_id"]
  puts "run blocked pending human.decision"

when "decide"
  options = {}
  parser = OptionParser.new do |opts|
    opts.on("--run RUN_ID", String) { |value| options[:run] = value }
    opts.on("--decision TEXT", String) { |value| options[:decision] = value }
    opts.on("--by WHO", String) { |value| options[:by] = value }
    opts.on("--note TEXT", String) { |value| options[:note] = value }
  end
  parser.parse!
  abort "decide requires --run --decision --by" unless options[:run] && options[:decision] && options[:by]
  event = AgentRuntime.decide!(
    options[:run],
    decision: options[:decision],
    by: options[:by],
    note: options[:note]
  )
  puts event["event_id"]
  puts "run status=#{AgentRuntime.load_run(options[:run])['status']}"

when "checkpoint"
  options = { actor: "Orchestrator Agent" }
  parser = OptionParser.new do |opts|
    opts.on("--run RUN_ID", String) { |value| options[:run] = value }
    opts.on("--ref REF", String) { |value| options[:ref] = value }
    opts.on("--note TEXT", String) { |value| options[:note] = value }
    opts.on("--actor NAME", String) { |value| options[:actor] = value }
  end
  parser.parse!
  abort "checkpoint requires --run --ref" unless options[:run] && options[:ref]
  event = AgentRuntime.checkpoint!(options[:run], ref: options[:ref], actor: options[:actor], note: options[:note])
  puts event["event_id"]

when "complete"
  options = { actor: "Orchestrator Agent" }
  parser = OptionParser.new do |opts|
    opts.on("--run RUN_ID", String) { |value| options[:run] = value }
    opts.on("--result RESULT", String) { |value| options[:result] = value }
    opts.on("--summary TEXT", String) { |value| options[:summary] = value }
    opts.on("--actor NAME", String) { |value| options[:actor] = value }
  end
  parser.parse!
  abort "complete requires --run --result" unless options[:run] && options[:result]
  event = AgentRuntime.complete!(options[:run], result: options[:result], actor: options[:actor], summary: options[:summary])
  puts event["event_id"]

when "block"
  options = { actor: "Orchestrator Agent" }
  parser = OptionParser.new do |opts|
    opts.on("--run RUN_ID", String) { |value| options[:run] = value }
    opts.on("--reason TEXT", String) { |value| options[:reason] = value }
    opts.on("--unblock TEXT", String) { |value| options[:unblock] = value }
    opts.on("--owner NAME", String) { |value| options[:owner] = value }
    opts.on("--actor NAME", String) { |value| options[:actor] = value }
  end
  parser.parse!
  abort "block requires --run --reason --unblock" unless options[:run] && options[:reason] && options[:unblock]
  event = AgentRuntime.block!(
    options[:run],
    reason: options[:reason],
    unblock_condition: options[:unblock],
    owner: options[:owner],
    actor: options[:actor]
  )
  puts event["event_id"]

when "list"
  options = { limit: 20 }
  parser = OptionParser.new do |opts|
    opts.on("--task TASK_ID", String) { |value| options[:task] = value }
    opts.on("--limit N", Integer) { |value| options[:limit] = value }
  end
  parser.parse!
  runs = AgentRuntime.list_runs(task_id: options[:task], limit: options[:limit])
  if runs.empty?
    puts "(no runs)"
    exit 0
  end
  runs.each do |header|
    puts [
      header["run_id"],
      header["task_id"],
      header["status"],
      header["mode"],
      header["updated_at"],
    ].join("\t")
  end

when "show", "timeline"
  run_id = ARGV.shift
  abort "#{command} requires RUN_ID" unless run_id
  puts AgentRuntime.format_show(run_id)

else
  abort "unknown command: #{command}\n\n#{usage}"
end
