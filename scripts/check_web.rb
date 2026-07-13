#!/usr/bin/env ruby
# frozen_string_literal: true

require "json"
require "pathname"

ROOT = Pathname(__dir__).parent
required = [
  ROOT.join("frontend/web/index.html"),
  ROOT.join("frontend/web/app.js"),
  ROOT.join("frontend/web/styles.css"),
]
missing = required.reject(&:file?)
abort JSON.generate(error: "missing web files", files: missing.map(&:to_s)) unless missing.empty?

html = required[0].read
abort "frontend/web/index.html does not reference app.js" unless html.include?("app.js")
abort "frontend/web/index.html does not reference styles.css" unless html.include?("styles.css")
abort "frontend/web/index.html does not contain a login form" unless html.include?("id=\"loginForm\"")
abort "frontend/web/index.html does not contain a review queue" unless html.include?("id=\"queueList\"")

puts "web static checks passed"
