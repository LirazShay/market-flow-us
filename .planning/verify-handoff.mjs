import fs from 'node:fs';

const status = fs.readFileSync('STATUS.yaml', 'utf8');
const planning = fs.readFileSync('.planning/STATUS.yaml', 'utf8');
const execution = fs.readFileSync('.planning/EXECUTION.yaml', 'utf8');
const tree = fs.readFileSync('.planning/TREE.yaml', 'utf8');

const phase = status.match(/^phase: ([a-z_]+)$/m)?.[1];
const planState = planning.match(/^plan_state: ([a-z_]+)$/m)?.[1];

if (phase !== 'implementation') {
  process.exit(0);
}

if (planState !== 'frozen') {
  throw new Error('Implementation phase requires plan_state: frozen');
}
if (/^chats: {}$/m.test(execution)) {
  throw new Error('Implementation phase requires allocated EXECUTION');
}

const pointer = status.match(/current:\n  chat: (\d+)\n  node: "([^"]+)"/);
if (!pointer) {
  throw new Error('Implementation STATUS must point to current chat and node');
}
const currentChat = Number(pointer[1]);
const currentNode = pointer[2];

const chatMatches = [...execution.matchAll(/^  "(\d+)":\n    nodes:\n((?:      "[^"]+": \{ state: [a-z_]+, result: (?:null|"[^"]*") \}\n)+)/gm)];
const chats = chatMatches.map(match => ({
  chat: Number(match[1]),
  nodes: [...match[2].matchAll(/^      "([^"]+)": \{ state: ([a-z_]+), result: (null|"[^"]*") \}$/gm)]
    .map(node => ({ id: node[1], state: node[2] }))
}));

const expectedChat = chats.find(chat => chat.nodes.some(node => node.state !== 'done'));
if (!expectedChat) {
  throw new Error('All execution nodes are done; root phase must advance from implementation');
}
const expectedNode = expectedChat.nodes.find(node => node.state !== 'done');

if (currentChat !== expectedChat.chat || currentNode !== expectedNode.id) {
  throw new Error(`STATUS pointer mismatch: expected Chat ${expectedChat.chat} / ${expectedNode.id}, got Chat ${currentChat} / ${currentNode}`);
}
if (expectedNode.state === 'blocked') {
  throw new Error('Blocked current node requires reopening planning');
}

const allStates = new Map(chats.flatMap(chat => chat.nodes.map(node => [node.id, node.state])));
const nodeStart = tree.indexOf(`  "${currentNode}":\n`);
if (nodeStart < 0) {
  throw new Error(`Current node ${currentNode} is missing from TREE`);
}
const nextNode = tree.indexOf('\n  "', nodeStart + 5);
const section = tree.slice(nodeStart, nextNode >= 0 ? nextNode : tree.length);
const depMatch = section.match(/depends_on: \[([^\]]*)\]/);
const deps = depMatch && depMatch[1].trim()
  ? depMatch[1].split(',').map(x => x.trim().replace(/^"|"$/g, ''))
  : [];
const blockers = deps.filter(dep => allStates.get(dep) !== 'done');
if (blockers.length) {
  throw new Error(`Current node ${currentNode} has unfinished dependencies: ${blockers.join(', ')}`);
}

console.log('Implementation handoff pointer verified', { chat: currentChat, node: currentNode });
