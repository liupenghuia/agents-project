#!/usr/bin/env ruby
# frozen_string_literal: true

require "fileutils"
require "json"
require "pathname"
require "tmpdir"
require_relative "lib/agent_runtime"

failures = []

def assert(condition, message, failures)
  if condition
    puts "PASS #{message}"
  else
    puts "FAIL #{message}"
    failures << message
  end
end

Dir.mktmpdir("agent-runtime-test") do |dir|
  ENV["AGENT_RUNS_DIR"] = dir

  header = AgentRuntime.start_run(task: "manual-demo-task", mode: "manual", actor: "Orchestrator Agent")
  run_id = header["run_id"]
  assert(run_id.start_with?("run-"), "start_run allocates run id", failures)
  assert(header["status"] == "running", "new run is running", failures)
  assert(File.file?(File.join(dir, run_id, "events.jsonl")), "events file exists", failures)

  AgentRuntime.emit(run_id, type: "node.entered", actor: "Product Agent", node: "discover")
  handoff = AgentRuntime.handoff(
    run_id,
    from_actor: "Product Agent",
    to_actor: "Architect Agent",
    from_status: "Draft",
    to_status: "Ready for Architecture",
    evidence: "product gate passed",
    next_action: "architect contracts",
    changed_files: ["tasks/demo.md"]
  )
  assert(handoff["markdown_row"].include?("Product Agent"), "handoff row includes actor", failures)
  assert(handoff["markdown_row"].include?("Ready for Architecture"), "handoff row includes status", failures)

  AgentRuntime.interrupt!(
    run_id,
    reason: "mvp tradeoff",
    options: %w[approve edit_scope park],
    actor: "Product Agent"
  )
  blocked = AgentRuntime.load_run(run_id)
  assert(blocked["status"] == "blocked", "interrupt blocks run", failures)

  AgentRuntime.decide!(run_id, decision: "approve", by: "User", note: "ship list MVP")
  resumed = AgentRuntime.load_run(run_id)
  assert(resumed["status"] == "running", "decision resumes run", failures)

  AgentRuntime.checkpoint!(run_id, ref: "deadbeef", note: "pre-implement")
  AgentRuntime.emit(
    run_id,
    type: "gate.evaluated",
    actor: "Architect Agent",
    node: "architecture_gate",
    payload: { "gate" => "architecture", "result" => "pass" }
  )
  AgentRuntime.complete!(run_id, result: "passed", summary: "ok")
  done = AgentRuntime.load_run(run_id)
  assert(done["status"] == "completed", "complete sets completed", failures)

  events = AgentRuntime.events(run_id)
  types = events.map { |event| event["type"] }
  assert(types.include?("run.started"), "has run.started", failures)
  assert(types.include?("message.handoff"), "has handoff", failures)
  assert(types.include?("interrupt.requested"), "has interrupt", failures)
  assert(types.include?("human.decision"), "has decision", failures)
  assert(types.include?("run.completed"), "has completed", failures)
  assert(events.all? { |event| event["schema_version"] == 1 }, "schema_version=1", failures)

  timeline = AgentRuntime.format_show(run_id)
  assert(timeline.include?("INTERRUPT"), "timeline shows interrupt", failures)
  assert(timeline.include?("DECISION"), "timeline shows decision", failures)
  assert(File.file?(File.join(dir, run_id, "summary.md")), "summary.md written", failures)

  listed = AgentRuntime.list_runs(limit: 5)
  assert(listed.any? { |item| item["run_id"] == run_id }, "list includes run", failures)

  begin
    AgentRuntime.emit(run_id, type: "not.a.type", actor: "X")
    assert(false, "rejects unknown event type", failures)
  rescue ArgumentError
    assert(true, "rejects unknown event type", failures)
  end

  begin
    AgentRuntime.emit(run_id, type: "note", actor: "X", node: "not_a_real_node")
    assert(false, "rejects unknown node", failures)
  rescue ArgumentError
    assert(true, "rejects unknown node", failures)
  end

  # Resolve a real task id from the repo if present.
  sample = Dir[File.expand_path("../tasks/*.md", __dir__)].find { |path| File.basename(path) != "template.md" }
  if sample
    meta = File.read(sample)[/\A---\n(.*?)\n---\n/m, 1]
    require "yaml"
    data = YAML.safe_load(meta, permitted_classes: [], aliases: false) || {}
    if data["id"]
      resolved = AgentRuntime.start_run(task: data["id"], mode: "delivery", actor: "Orchestrator Agent")
      assert(resolved["task_id"] == data["id"], "resolves task by id", failures)
      assert(!resolved["task_file"].to_s.empty?, "stores task_file", failures)
    end
  end
end

if failures.empty?
  puts "Agent runtime tests passed."
  exit 0
end

warn "Agent runtime tests failed:"
failures.each { |item| warn "- #{item}" }
exit 1
