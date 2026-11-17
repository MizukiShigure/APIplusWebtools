const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(`${__dirname}/app.js`,'utf8');
function extract(name){const start=source.indexOf(`function ${name}(`);assert.ok(start>=0,name);return source.slice(start,source.indexOf('\nfunction ',start+1));}
const env=vm.createContext({
  generationAssetsFromRecord:r=>r.refs||[],generationPageFromRecord:r=>r.page,
  HISTORY_ORIGIN_UTILS:{originKey:()=> 'agent:test'},guessType:()=> 'other',
  memoHistoryDerivation:(_,f)=>f(),generationResultKey:(id,i)=>`${id}:${i}`,
  state:{generationHistory:[]},escapeHtml:s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
});
vm.runInContext(['generationInputSignature','assetSignature','stableStringify','generationResultItems'].map(extract).join('\n'),env);
const base={id:'a',page:'audio',prompt:'Hello',model:'MiniMax',params:{speed:1,vol:1}};
assert.notEqual(env.generationInputSignature(base),env.generationInputSignature({...base,params:{speed:1.5,vol:1}}),'distinct voice settings are not grouped');
assert.notEqual(env.generationInputSignature({...base,params:{generate_mode:'video_edit',keep_video_sound:true}}),env.generationInputSignature({...base,params:{generate_mode:'video_edit',keep_video_sound:false}}));
env.state.generationHistory=[{...base,mediaType:'audio',results:['https://cdn.example/opaque'],outputs:[{url:'https://cdn.example/opaque',type:'audio'}]}];
assert.equal(env.generationResultItems()[0].type,'audio');
vm.runInContext(['historyAuditValue','renderGenerationAuditDetails'].map(extract).join('\n'),env);
const html=env.renderGenerationAuditDetails({...base,refs:[{name:'source.wav',sourcePath:'inputs/source.wav',duration:35,url:'https://cdn.example/source'}],params:{speed:1.5,apiKey:'example-private-test',prompt:'<script>test</script>'}});
assert.match(html,/source.wav/);assert.match(html,/sourcePath/);assert.match(html,/1.5/);
assert.doesNotMatch(html,/example-private-test|<script>/);
assert.match(html,/&lt;script&gt;/);
console.log('History grouping, media type and provenance display checks passed');
