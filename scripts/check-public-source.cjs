// Check the exact Git index (or tracked HEAD files in CI), never private runtime data.
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const staged=process.argv.includes('--staged');
const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',windowsHide:true,maxBuffer:32*1024*1024});
const builder=fs.readFileSync(path.join(root,'scripts/build-portable.ps1'),'utf8');
const block=builder.split('$publicFiles = @(')[1].split('\n)')[0];
const allowed=new Set([...block.matchAll(/^\s*"([^"]+)"/gm)].map(match=>match[1]));
for(const name of ['.gitattributes','.github/workflows/ci.yml','.github/PULL_REQUEST_TEMPLATE.md'])allowed.add(name);
const files=git('ls-files','-z').split('\0').filter(Boolean);
const issues=[];
const privateHosts=(process.env.API_PLUS_PRIVATE_HOSTS || '').split(',').map(value=>value.trim().toLowerCase()).filter(Boolean);
for(const file of files) {
  if(!allowed.has(file)){issues.push(`${file}: outside public source allowlist`);continue;}
  const text=staged?git('show',`:${file}`):fs.readFileSync(path.join(root,file),'utf8');
  if(file==='app.js' && !text.includes('const API_DEFAULT = "";'))issues.push(`${file}: API Base must be empty in public source`);
  if(privateHosts.some(host=>text.toLowerCase().includes(host) || text.toLowerCase().includes(host.replaceAll('.','\\.'))))issues.push(`${file}: private gateway address`);
  const patterns=[
    ['private key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
    ['access token',/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|sk-[A-Za-z0-9_-]{32,})\b/],
    ['personal installation path',/[A-Z]:[\\/](?:Users[\\/]\d{4,}|Codex test[\\/])/i]
  ];
  for(const [label,pattern]of patterns)if(pattern.test(text))issues.push(`${file}: ${label}`);
}
if(issues.length){console.error(issues.join('\n'));process.exitCode=1;}
else console.log(`Public source check passed (${files.length} ${staged?'indexed':'tracked'} files).`);
