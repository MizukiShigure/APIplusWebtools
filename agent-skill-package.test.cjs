const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { spawnSync } = require("node:child_process");

const root = __dirname;
const skillDir = path.join(root, "skills", "api-plus-agent");
const skillFile = path.join(skillDir, "SKILL.md");
const referenceFile = path.join(skillDir, "references", "agent-api.md");
const clientFile = path.join(skillDir, "scripts", "api-plus-agent-client.mjs");
const metadataFile = path.join(skillDir, "agents", "openai.yaml");

for (const file of [skillFile, referenceFile, clientFile, metadataFile]) {
  assert.equal(fs.existsSync(file), true, `missing Agent skill file: ${path.relative(root, file)}`);
}

const skill = fs.readFileSync(skillFile, "utf8");
const reference = fs.readFileSync(referenceFile, "utf8");
const clientSource = fs.readFileSync(clientFile, "utf8");
const allText = `${skill}\n${reference}\n${clientSource}`;

assert.match(skill, /^---\s*[\s\S]*?name:\s*api-plus-agent\s*$/m);
assert.match(skill, /^description:\s*Use when\b/m);
assert.match(allText, /http:\/\/127\.0\.0\.1:4198\/api\/agent\/v1/);
assert.match(allText, /API_PLUS_AGENT_TOKEN/);
assert.match(allText, /waiting_for_worker/);
assert.match(allText, /browser worker|browser-worker|browser tab/i);
assert.match(allText, /capabilities/);
assert.match(skill, /no open browser tab or local Agent token setup is required/i);
assert.match(skill, /recreate/);
assert.match(skill, /source path, hash/i);
assert.equal(fs.existsSync(path.join(skillDir, 'scripts/run-workbench.ps1')), true);
assert.equal(fs.existsSync(path.join(skillDir, 'references/portable-setup.md')), true);

for (const command of ["capabilities", "upload", "submit", "status", "wait", "cancel"]) {
  assert.match(clientSource, new RegExp(`\\b${command}\\b`), `client must implement ${command}`);
}

assert.doesNotMatch(allText, /gateway\.example/i, "Agent clients must use the localhost service, not the company gateway directly");
assert.doesNotMatch(allText, /api[_-]?key\s*[:=]\s*["'][A-Za-z0-9_-]{16,}/i, "embedded API credential detected");
assert.doesNotMatch(allText, /bearer\s+[A-Za-z0-9_-]{20,}/i, "embedded bearer token detected");

const help = spawnSync(process.execPath, [clientFile, "--help"], {
  cwd: root,
  encoding: "utf8",
  env: { ...process.env, API_PLUS_AGENT_TOKEN: "" }
});
assert.equal(help.status, 0, help.stderr || help.stdout);
for (const command of ["capabilities", "upload", "submit", "status", "wait", "cancel"]) {
  assert.match(help.stdout, new RegExp(`\\b${command}\\b`));
}

(async () => {
  const client = await import(`${pathToFileURL(clientFile).href}?test=${Date.now()}`);
  assert.equal(typeof client.stableClientTaskId, "function");
  assert.equal(typeof client.originFromEnvironment, "function");

  const first = client.stableClientTaskId({
    taskType: "image",
    input: { prompt: "hello", options: { size: "1:1", quality: "2K" } },
    origin: { type: "agent", client: "codex", id: "desk", label: "Codex desktop" }
  });
  const reordered = client.stableClientTaskId({
    origin: { label: "Codex desktop", id: "desk", client: "codex", type: "agent" },
    input: { options: { quality: "2K", size: "1:1" }, prompt: "hello" },
    taskType: "image"
  });
  const changed = client.stableClientTaskId({
    taskType: "image",
    input: { prompt: "different" },
    origin: { type: "agent", client: "codex", id: "desk", label: "Codex desktop" }
  });
  assert.equal(first, reordered, "equivalent payloads must generate the same clientTaskId");
  assert.notEqual(first, changed, "changed input must generate a different clientTaskId");
  assert.match(first, /^agent-[a-f0-9]{24}$/);

  const origin = client.originFromEnvironment({
    API_PLUS_AGENT_SOURCE_CLIENT: "minimax-code",
    API_PLUS_AGENT_SOURCE_ID: "workstation-2",
    API_PLUS_AGENT_SOURCE_LABEL: "Minimax Code workstation"
  });
  assert.deepEqual(origin, {
    type: "agent",
    client: "minimax-code",
    id: "workstation-2",
    label: "Minimax Code workstation"
  });

  const os = require('node:os');
  const video = path.join(os.tmpdir(), `avatar-upload-test-${process.pid}.mp4`);
  const originalFetch=global.fetch, originalWrite=process.stdout.write;
  let uploadedPath='', uploadedType='';
  try {
    fs.writeFileSync(video,Buffer.from('synthetic-video-fixture'));
    global.fetch=async (url,options)=>{
      if (new URL(url).pathname.endsWith('/capabilities')) return new Response(JSON.stringify({success:true,taskTypes:[]}),{status:200,headers:{'Content-Type':'application/json'}});
      uploadedPath=new URL(url).pathname;
      uploadedType=options.body.get('file').type;
      return new Response(JSON.stringify({success:true,url:'/api/control/v1/avatar-workflow/media/example.mp4'}),{status:200,headers:{'Content-Type':'application/json'}});
    };
    process.stdout.write=()=>true;
    const code=await client.main(['avatar-upload',video],{API_PLUS_AGENT_TOKEN:'example-token'});
    assert.equal(code,0,'independent subtitle input accepts a video upload');
    assert.equal(uploadedPath,'/api/agent/v1/avatar-workflow/media');
    assert.equal(uploadedType,'video/mp4');
  } finally {
    global.fetch=originalFetch;process.stdout.write=originalWrite;
    fs.rmSync(video,{force:true});
  }
  console.log("agent-skill-package.test.cjs: ok");
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
