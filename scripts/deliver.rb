#!/usr/bin/env ruby
# frozen_string_literal: true

require "fileutils"
require "net/http"
require "open3"
require "optparse"
require "pathname"
require "securerandom"
require "socket"
require "timeout"
require "yaml"

ROOT = Pathname(__dir__).parent
DEFAULT_ROUNDS = 3
COMMAND_TIMEOUT = 180

options = { max_rounds: DEFAULT_ROUNDS, repair_command: ENV["DELIVERY_REPAIR_COMMAND"] }
parser = OptionParser.new do |opts|
  opts.banner = "Usage: ruby scripts/deliver.rb TASK [options]"
  opts.on("--max-rounds N", Integer, "Maximum test/repair rounds (default: #{DEFAULT_ROUNDS})") { |n| options[:max_rounds] = n }
  opts.on("--repair-command COMMAND", "Command used to repair a failed round") { |command| options[:repair_command] = command }
  opts.on("--help", "Show this help") { puts opts; exit 0 }
end
parser.parse!

task_name = ARGV.shift
abort parser.to_s unless task_name
abort "--max-rounds must be positive" unless options[:max_rounds].positive?

def task_path(name)
  direct = ROOT.join("tasks", "#{name}.md")
  return direct if direct.file?

  candidates = Dir[ROOT.join("tasks", "*.md")].map { |path| Pathname(path) }
  match = candidates.find do |path|
    path.read[/^title:\s*["']?(.+?)["']?\s*$/]&.then { |title| title[1].strip == name }
  end
  match
end

task_file = task_path(task_name)
abort "task not found: #{task_name}" unless task_file

def front_matter(path)
  match = path.read.match(/\A---\n(.*?)\n---\n/m)
  abort "task has no YAML front matter: #{path}" unless match
  YAML.safe_load(match[1], permitted_classes: [], aliases: false)
end

task = front_matter(task_file)
run_id = "#{Time.now.strftime('%Y%m%d-%H%M%S')}-#{SecureRandom.hex(3)}"
run_dir = Pathname("/tmp/ppfiles-learn-delivery").join(task["id"].to_s, run_id)
FileUtils.mkdir_p(run_dir)

results = []

def execute(label, command, cwd:, env: {}, log_dir:)
  log = log_dir.join("#{label.gsub(/[^a-zA-Z0-9_-]/, '_')}.log")
  output = ""
  status = nil
  begin
    Timeout.timeout(COMMAND_TIMEOUT) do
      output, error, status = Open3.capture3(env, *command, chdir: cwd.to_s)
      output = "#{output}#{error}"
    end
  rescue Timeout::Error
    output = "command timed out after #{COMMAND_TIMEOUT}s\n"
    status = Struct.new(:success?).new(false)
  end
  log.write(output)
  {
    label: label,
    command: command.join(" "),
    success: status&.success? || false,
    log: log.to_s,
    output: output,
  }
end

def node_files(directory)
  Dir[ROOT.join(directory, "**", "*.js")].sort
end

def wait_for_http(url, process, log_path, attempts: 30)
  uri = URI(url)
  attempts.times do
    begin
      response = Net::HTTP.get_response(uri)
      return response if response.is_a?(Net::HTTPSuccess)
    rescue StandardError
      # The service may still be starting.
    end
    sleep 0.2
    break unless process_alive?(process)
  end
  details = File.exist?(log_path) ? File.read(log_path) : ""
  raise "service did not become healthy: #{url}\n#{details}"
end

def process_alive?(pid)
  Process.kill(0, pid)
  true
rescue Errno::ESRCH
  false
rescue Errno::EPERM
  true
end

def free_port
  socket = TCPServer.new("127.0.0.1", 0)
  port = socket.addr[1]
  socket.close
  port
end

def start_service(label, command, env, cwd, run_dir, health_url)
  stdout = run_dir.join("#{label}.service.log")
  io = File.open(stdout, "w")
  process = Process.spawn(env, *command, chdir: cwd.to_s, out: io, err: [:child, :out])
  io.close
  wait_for_http(health_url, process, stdout.to_s)
  [process, stdout]
rescue StandardError
  begin
    Process.kill("TERM", process) if process && process_alive?(process)
  rescue StandardError
    nil
  end
  raise
end

def stop_service(process)
  return unless process
  Process.kill("TERM", process) if process_alive?(process)
  Timeout.timeout(5) { Process.wait(process) }
rescue StandardError
  Process.kill("KILL", process) if process_alive?(process)
  Process.wait(process) rescue nil
end

def run_round(task, round, run_dir)
  results = []
  results << execute("workflow", ["ruby", "scripts/validate_workflow.rb"], cwd: ROOT, log_dir: run_dir)

  required = task.fetch("required_scopes", {})
  targets = task.fetch("frontend_targets", {})

  if required["backend"]
    results << execute("backend-tests", ["npm", "test"], cwd: ROOT.join("backend"), log_dir: run_dir)
    node_files("backend/src").each_with_index do |file, index|
      results << execute("backend-syntax-#{index}", ["node", "--check", file], cwd: ROOT, log_dir: run_dir)
    end
  end

  if targets["miniprogram"]
    node_files("frontend/miniprogram").each_with_index do |file, index|
      results << execute("miniprogram-syntax-#{index}", ["node", "--check", file], cwd: ROOT, log_dir: run_dir)
    end
    test_files = Dir[ROOT.join("frontend/miniprogram/tests", "*.test.js")].sort
    test_files.each_with_index do |file, index|
      results << execute("miniprogram-test-#{index}", ["node", file], cwd: ROOT, log_dir: run_dir)
    end
  end

  if targets["web"]
    results << execute("web-syntax", ["node", "--check", "frontend/web/app.js"], cwd: ROOT, log_dir: run_dir)
    results << execute("web-static", ["ruby", "scripts/check_web.rb"], cwd: ROOT, log_dir: run_dir)
  end

  backend_process = nil
  web_process = nil
  backend_port = free_port
  web_port = free_port
  begin
    if required["backend"]
      backend_process, = start_service(
        "backend",
        ["node", "src/server.js"],
        { "NODE_ENV" => "test", "PORT" => backend_port.to_s, "DATABASE_PATH" => ":memory:", "WECHAT_MOCK" => "1" },
        ROOT.join("backend"),
        run_dir,
        "http://127.0.0.1:#{backend_port}/health"
      )
      results << { label: "backend-health", command: "GET http://127.0.0.1:#{backend_port}/health", success: true, log: run_dir.join("backend.service.log").to_s, output: "healthy" }
    end
    if targets["web"]
      web_process, = start_service(
        "web",
        ["python3", "-m", "http.server", web_port.to_s, "--directory", "frontend/web"],
        {},
        ROOT,
        run_dir,
        "http://127.0.0.1:#{web_port}/index.html"
      )
      results << { label: "web-health", command: "GET http://127.0.0.1:#{web_port}/index.html", success: true, log: run_dir.join("web.service.log").to_s, output: "healthy" }
    end
  rescue StandardError => error
    results << { label: "service-health", command: "start required local services", success: false, log: run_dir.join("services.log").to_s, output: error.message }
  ensure
    stop_service(web_process)
    stop_service(backend_process)
  end

  results
end

def write_report(path, task, run_id, rounds, final_results)
  lines = ["# Delivery Run #{run_id}", "", "- Task: `#{task['id']}`", "- Status: #{final_results.all? { |result| result[:success] } ? 'Passed' : 'Failed'}", "", "## Rounds", ""]
  rounds.each do |round, results|
    lines << "### Round #{round}"
    results.each do |result|
      marker = result[:success] ? "PASS" : "FAIL"
      lines << "- [#{marker}] `#{result[:label]}`: `#{result[:command]}`"
      lines << "  Log: `#{result[:log]}`"
    end
    lines << ""
  end
  path.write(lines.join("\n"))
end

rounds = {}
final_results = []
(1..options[:max_rounds]).each do |round|
  round_dir = run_dir.join("round-#{round}")
  FileUtils.mkdir_p(round_dir)
  puts "[delivery] round #{round}/#{options[:max_rounds]}: running checks"
  final_results = run_round(task, round, round_dir)
  rounds[round] = final_results
  failures = final_results.reject { |result| result[:success] }
  if failures.empty?
    puts "[delivery] round #{round}: passed"
    break
  end

  puts "[delivery] round #{round}: #{failures.length} check(s) failed"
  unless options[:repair_command]
    puts "[delivery] no repair command configured; stopping with evidence"
    break
  end
  next if round == options[:max_rounds]

  repair = execute(
    "repair-round-#{round}",
    ["sh", "-lc", options[:repair_command]],
    cwd: ROOT,
    env: { "DELIVERY_TASK" => task_file.to_s, "DELIVERY_ROUND" => round.to_s, "DELIVERY_RUN_DIR" => run_dir.to_s },
    log_dir: run_dir
  )
  rounds[round] << repair
  unless repair[:success]
    puts "[delivery] repair command failed; stopping with evidence"
    break
  end
end

report = run_dir.join("report.md")
write_report(report, task, run_id, rounds, final_results)
puts "[delivery] report: #{report}"
exit(final_results.all? { |result| result[:success] } ? 0 : 1)
