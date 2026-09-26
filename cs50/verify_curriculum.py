#!/usr/bin/env python3
"""Structural smoke test. This does not prove pedagogical or code correctness."""
import ast
import json
from pathlib import Path

root = Path(__file__).resolve().parent
manifest = json.loads((root / 'manifest.json').read_text(encoding='utf-8'))
units = [json.loads((root / name).read_text(encoding='utf-8')) for name in manifest['unitFiles']]
assert len(units) == 12
assert len({unit['id'] for unit in units}) == 12
questions = [q for unit in units for q in unit['quiz']]
tasks = [task for unit in units for task in unit['tasks']]
assert len(questions) == 72 and len({q['id'] for q in questions}) == 72
assert len(tasks) == 60 and len({task['id'] for task in tasks}) == 60
for unit in units:
    assert len(unit['theory']) == 4 and len(unit['quiz']) == 6
    assert {task['kind'] for task in unit['tasks']} == {'build', 'debug', 'modify', 'rebuild', 'project'}
for q in questions:
    assert len(q['options']) >= 2 and 0 <= q['answer'] < len(q['options'])
for task in tasks:
    assert task['requirements'] and task['rubric'] and task['hints']
    assert Path(task['file']).name == task['file']
    if task.get('tests'):
        assert len({case['id'] for case in task['tests']}) == len(task['tests'])
        assert all('input' in case and 'expected' in case for case in task['tests'])
auto = [task for task in tasks if task.get('tests')]
assert len(auto) == 30
assert sum(len(task['tests']) for task in auto) == 112
ast.parse((root / 'check.py').read_text(encoding='utf-8'))
print('PASS: 12 sections, 72 questions, 60 tasks, 30 automatic labs, 112 cases; checker syntax valid.')
