import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const platformRoot = fileURLToPath(new URL('../../src/platform/', import.meta.url))

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name)
    return entry.isDirectory() ? sourceFiles(file) : /\.tsx?$/.test(file) ? [file] : []
  })
}

function importReferences(source: string): string[] {
  const references: string[] = []
  const tree = ts.createSourceFile('boundary.ts', source, ts.ScriptTarget.Latest, true)
  function visit(node: ts.Node): void {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
        node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) {
      references.push(node.moduleSpecifier.text)
    }
    if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
      references.push(node.argument.literal.text)
    }
    if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) {
      const argument = node.arguments[0]
      references.push(argument && ts.isStringLiteral(argument) ? argument.text : '<computed-import>')
    }
    ts.forEachChild(node, visit)
  }
  visit(tree)
  return references
}

function isPlatformReference(from: string, reference: string): boolean {
  if (!reference.startsWith('.')) return false
  const target = path.resolve(path.dirname(from), reference)
  const relative = path.relative(platformRoot, target)
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

describe('platform import boundary', () => {
  it('allows only internal platform references, including type imports and re-exports', () => {
    const files = sourceFiles(platformRoot)
    expect(files.length).toBeGreaterThan(0)
    const violations = files.flatMap((file) => importReferences(readFileSync(file, 'utf8'))
      .filter((reference) => !isPlatformReference(file, reference))
      .map((reference) => `${path.relative(platformRoot, file)} → ${reference}`))
    expect(violations).toEqual([])
  })

  it('recognizes static, dynamic, type-only and re-export dependencies', () => {
    expect(importReferences(`
      import React from 'react';
      export { a } from '../../modules/controls/descriptor';
      type T = import('three').Vector3;
      import('../app/App');
      require('react-dom');
      import(variable);
    `)).toEqual(['react', '../../modules/controls/descriptor', 'three', '../app/App', 'react-dom', '<computed-import>'])
  })

  it('rejects renderer/course/alias imports while accepting kernel internals', () => {
    const from = path.join(platformRoot, 'state', 'types.ts')
    expect(isPlatformReference(from, '../units/types')).toBe(true)
    for (const reference of ['react', 'three', '@react-three/fiber', '../../modules/controls/descriptor', '../../scene/aircraft', '../../../lessons/week-06', '@/app']) {
      expect(isPlatformReference(from, reference), reference).toBe(false)
    }
  })
})
