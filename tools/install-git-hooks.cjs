#!/usr/bin/env node

const { execFileSync } = require('node:child_process')
const { existsSync } = require('node:fs')
const path = require('node:path')

const root = process.cwd()
const hooksDir = path.join(root, '.githooks')

if (!existsSync(hooksDir)) {
  process.exit(0)
}

try {
  execFileSync('git', ['rev-parse', '--is-inside-work-tree'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'ignore'],
  })
} catch {
  process.exit(0)
}

let current = ''
try {
  current = execFileSync('git', ['config', '--get', 'core.hooksPath'], {
    cwd: root,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim()
} catch {
  current = ''
}

const normalized = current.replace(/\/+$/, '').replace(/^\.\//, '')
if (normalized === '.githooks') {
  process.exit(0)
}

try {
  execFileSync('git', ['config', 'core.hooksPath', '.githooks'], {
    cwd: root,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  console.log('✅ Git hooks installed at .githooks')
} catch (error) {
  console.warn('⚠️ Could not set git core.hooksPath to .githooks')
  if (error && typeof error === 'object' && 'message' in error) {
    console.warn(String(error.message))
  }
}
