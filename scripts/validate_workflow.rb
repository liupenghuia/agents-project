#!/usr/bin/env ruby
# frozen_string_literal: true

require "date"
require "yaml"

ROOT = File.expand_path("..", __dir__)
IDEA_STATUSES = ["Captured", "Discovering", "Ready for Review", "Approved", "Parked", "Rejected", "Promoted"].freeze
TASK_STATUSES = [
  "Draft", "Ready for Architecture", "Ready for Implementation", "In Progress",
  "Blocked", "Ready for Test", "Test Failed", "Ready for Retest",
  "Ready for Release", "Released", "Done", "Cancelled"
].freeze
ISSUE_STATUSES = ["Open", "Assigned", "Fixing", "Ready for Retest", "Retest Failed", "Closed"].freeze
SCOPE_STATUSES = ["N/A", "Pending", "In Progress", "Blocked", "Done"].freeze
PRIORITIES = %w[P0 P1 P2 P3].freeze
IMPLEMENTATION_SCOPES = %w[backend frontend mobile ios android].freeze
ALL_SCOPES = %w[product architecture backend frontend mobile ios android test release].freeze
OWNERS = [
  "Product Agent", "Architect Agent", "Backend Agent", "Frontend Agent", "Mobile Agent",
  "iOS Agent", "Android Agent", "Test Agent", "Orchestrator Agent"
].freeze

errors = []

def metadata(path, errors)
  lines = File.readlines(path)
  unless lines.first&.strip == "---"
    errors << "#{path}: missing YAML front matter"
    return {}
  end

  closing = lines[1..]&.index { |line| line.strip == "---" }
  unless closing
    errors << "#{path}: unterminated YAML front matter"
    return {}
  end

  YAML.safe_load(lines[1..closing].join, permitted_classes: [Date], aliases: false) || {}
rescue Psych::SyntaxError => e
  errors << "#{path}: invalid YAML (#{e.message.lines.first.strip})"
  {}
end

idea_paths = Dir[File.join(ROOT, "ideas", "*.md")].reject { |path| File.basename(path) == "template.md" }
task_paths = Dir[File.join(ROOT, "tasks", "*.md")].reject { |path| File.basename(path) == "template.md" }
issue_paths = Dir[File.join(ROOT, "issues", "*.md")].reject { |path| File.basename(path) == "template.md" }
ideas = idea_paths.to_h { |path| [path, metadata(path, errors)] }
tasks = task_paths.to_h { |path| [path, metadata(path, errors)] }
issues = issue_paths.to_h { |path| [path, metadata(path, errors)] }

def require_fields(path, data, fields, errors)
  fields.each { |field| errors << "#{path}: missing #{field}" unless data.key?(field) }
end

ids = {}
ideas.merge(tasks).merge(issues).each do |path, data|
  id = data["id"]
  next unless id

  errors << "#{path}: duplicate id #{id} (also #{ids[id]})" if ids.key?(id)
  ids[id] = path
end

idea_by_id = ideas.each_with_object({}) { |(path, data), index| index[data["id"]] = [path, data] if data["id"] }
task_by_id = tasks.each_with_object({}) { |(path, data), index| index[data["id"]] = [path, data] if data["id"] }
issue_by_id = issues.each_with_object({}) { |(path, data), index| index[data["id"]] = [path, data] if data["id"] }

ideas.each do |path, idea|
  require_fields(path, idea, %w[id title status priority owner decision_owner created updated promoted_tasks], errors)
  errors << "#{path}: invalid idea id #{idea['id']}" unless idea["id"].to_s.match?(/\AIDEA-\d{8}-\d{3}\z/)
  errors << "#{path}: invalid status #{idea['status']}" unless IDEA_STATUSES.include?(idea["status"])
  errors << "#{path}: invalid priority #{idea['priority']}" unless PRIORITIES.include?(idea["priority"])
  errors << "#{path}: idea owner must be Product Agent" unless idea["owner"] == "Product Agent"
  if idea["decision_owner"].nil? || idea["decision_owner"].to_s.strip.empty?
    errors << "#{path}: decision_owner is required"
  end
  unless idea["promoted_tasks"].is_a?(Array)
    errors << "#{path}: promoted_tasks must be a list"
  end
  if idea["status"] == "Promoted" && Array(idea["promoted_tasks"]).empty?
    errors << "#{path}: Promoted requires at least one promoted task"
  end

  Array(idea["promoted_tasks"]).each do |task_id|
    task = task_by_id[task_id]
    errors << "#{path}: unknown promoted task #{task_id}" unless task
    if idea["status"] == "Promoted" && task && task.last["source_idea"] != idea["id"]
      errors << "#{path}: promoted task #{task_id} does not link source idea #{idea['id']}"
    end
  end
end

tasks.each do |path, task|
  require_fields(path, task, %w[id title status priority owner created updated source_idea depends_on linked_issues required_scopes scope_status release_required], errors)
  errors << "#{path}: invalid task id #{task['id']}" unless task["id"].to_s.match?(/\ATASK-\d{8}-\d{3}\z/)
  errors << "#{path}: invalid status #{task['status']}" unless TASK_STATUSES.include?(task["status"])
  errors << "#{path}: invalid priority #{task['priority']}" unless PRIORITIES.include?(task["priority"])
  errors << "#{path}: invalid owner #{task['owner']}" unless OWNERS.include?(task["owner"])

  source_idea = task["source_idea"]
  if source_idea
    idea = idea_by_id[source_idea]
    errors << "#{path}: unknown source idea #{source_idea}" unless idea
    if idea && !["Approved", "Promoted"].include?(idea.last["status"])
      errors << "#{path}: source idea #{source_idea} must be Approved or Promoted"
    end
    if idea&.last&.dig("status") == "Promoted" && !Array(idea.last["promoted_tasks"]).include?(task["id"])
      errors << "#{path}: source idea #{source_idea} does not link task #{task['id']}"
    end
  end

  required = task["required_scopes"]
  scopes = task["scope_status"]
  unless required.is_a?(Hash) && scopes.is_a?(Hash)
    errors << "#{path}: required_scopes and scope_status must be mappings"
    next
  end

  IMPLEMENTATION_SCOPES.each do |scope|
    errors << "#{path}: required_scopes missing #{scope}" unless [true, false].include?(required[scope])
  end
  ALL_SCOPES.each do |scope|
    errors << "#{path}: invalid or missing scope_status.#{scope}" unless SCOPE_STATUSES.include?(scopes[scope])
  end
  IMPLEMENTATION_SCOPES.each do |scope|
    if required[scope] == false && scopes[scope] != "N/A"
      errors << "#{path}: non-required #{scope} scope must be N/A"
    elsif required[scope] == true && scopes[scope] == "N/A"
      errors << "#{path}: required #{scope} scope cannot be N/A"
    end
  end

  if task["release_required"] == false && scopes["release"] != "N/A"
    errors << "#{path}: release scope must be N/A when release_required is false"
  elsif task["release_required"] == true && scopes["release"] == "N/A"
    errors << "#{path}: release scope cannot be N/A when release_required is true"
  elsif ![true, false].include?(task["release_required"])
    errors << "#{path}: release_required must be true or false"
  end

  architecture_ready = [
    "Ready for Implementation", "In Progress", "Ready for Test", "Test Failed",
    "Ready for Retest", "Ready for Release", "Released", "Done"
  ].include?(task["status"])
  errors << "#{path}: product and architecture scopes must be Done" if architecture_ready && [scopes["product"], scopes["architecture"]] != ["Done", "Done"]

  implementation_done = ["Ready for Test", "Test Failed", "Ready for Retest", "Ready for Release", "Released", "Done"].include?(task["status"])
  if implementation_done
    required.select { |_scope, needed| needed }.each_key do |scope|
      errors << "#{path}: required #{scope} scope must be Done at #{task['status']}" unless scopes[scope] == "Done"
    end
  end

  if ["Ready for Release", "Released", "Done"].include?(task["status"])
    errors << "#{path}: test scope must be Done at #{task['status']}" unless scopes["test"] == "Done"
  end
  if task["status"] == "Done" && task["release_required"] && scopes["release"] != "Done"
    errors << "#{path}: release scope must be Done"
  end

  if task["status"] == "Blocked"
    %w[blocked_reason blocked_since unblock_owner unblock_condition].each do |field|
      errors << "#{path}: #{field} is required while Blocked" if task[field].nil? || task[field].to_s.strip.empty?
    end
  end

  errors << "#{path}: depends_on must be a list" unless task["depends_on"].is_a?(Array)
  errors << "#{path}: linked_issues must be a list" unless task["linked_issues"].is_a?(Array)
  if ["Test Failed", "Ready for Retest"].include?(task["status"]) && Array(task["linked_issues"]).empty?
    errors << "#{path}: #{task['status']} requires at least one linked issue"
  end

  Array(task["depends_on"]).each do |dependency|
    dep = task_by_id[dependency]
    errors << "#{path}: unknown dependency #{dependency}" unless dep
    errors << "#{path}: dependency #{dependency} is not Done" if task["status"] == "Done" && dep && dep.last["status"] != "Done"
  end
  Array(task["linked_issues"]).each do |issue_id|
    issue = issue_by_id[issue_id]
    errors << "#{path}: unknown linked issue #{issue_id}" unless issue
    errors << "#{path}: linked issue #{issue_id} is not Closed" if task["status"] == "Done" && issue && issue.last["status"] != "Closed"
    if task["status"] == "Ready for Retest" && issue && !["Ready for Retest", "Closed"].include?(issue.last["status"])
      errors << "#{path}: linked issue #{issue_id} is not ready for retest or closed"
    end
  end
end

issues.each do |path, issue|
  require_fields(path, issue, %w[id title status severity owner task found_by created updated], errors)
  errors << "#{path}: invalid issue id #{issue['id']}" unless issue["id"].to_s.match?(/\AISSUE-\d{8}-\d{3}\z/)
  errors << "#{path}: invalid status #{issue['status']}" unless ISSUE_STATUSES.include?(issue["status"])
  errors << "#{path}: invalid severity #{issue['severity']}" unless PRIORITIES.include?(issue["severity"])
  errors << "#{path}: invalid owner #{issue['owner']}" unless OWNERS.include?(issue["owner"])
  errors << "#{path}: unknown task #{issue['task']}" unless task_by_id.key?(issue["task"])
  related_task = task_by_id[issue["task"]]&.last
  if related_task && !Array(related_task["linked_issues"]).include?(issue["id"])
    errors << "#{path}: task #{issue['task']} does not link issue #{issue['id']}"
  end
end

if errors.empty?
  puts "Workflow validation passed (#{ideas.length} ideas, #{tasks.length} tasks, #{issues.length} issues)."
  exit 0
end

warn "Workflow validation failed:"
errors.each { |error| warn "- #{error.sub(ROOT + '/', '')}" }
exit 1
