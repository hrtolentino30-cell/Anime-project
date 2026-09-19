import test from 'node:test';
import assert from 'node:assert/strict';
import {episodePlayerUrls,finiteHlsDuration,confirmedHlsShort} from '../scripts/facebook-hls-validation.mjs';
const playlist = '#EXTM3U\n#EXT-X-TARGETDURATION:30\n#EXTINF:30,\na.ts\n#EXTINF:30,\nb.ts\n#EXTINF:30,\nc.ts\n#EXT-X-ENDLIST\n';
test('complete finite HLS sums segment durations', () => {
 assert.equal(finiteHlsDuration(playlist),90);
 assert.equal(finiteHlsDuration(playlist.replaceAll('\n','\r\n')),90);
});
test('live, master, malformed, gapped and incomplete playlists fail closed', () => {
 for (const p of [
  playlist.replace('#EXT-X-ENDLIST',''),
  '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=10\nv.m3u8\n#EXT-X-ENDLIST',
  playlist.replace('#EXTINF:30,','#EXTINF:NaN,'),
  playlist.replace('c.ts',''),
  playlist.replace('#EXTINF:30,','#EXT-X-GAP\n#EXTINF:30,'),
  '<html>Access denied</html>',
  playlist.replace('#EXTINF:30,\nb.ts\n','')
 ]) assert.equal(finiteHlsDuration(p),null);
});
test('only declared non-dub/non-AnimePahe iframe mirrors establish provenance', () => {
 const embed = url => Buffer.from('<iframe src="'+url+'"></iframe>').toString('base64');
 const html = '<iframe src="https://ads.example/ad"></iframe>'+
 '<option value="'+embed('https://player.example/e/episode')+'">Sub - Player</option>'+
 '<option value="'+embed('https://dub.example/e/episode')+'">Dub - Player</option>'+
 '<option value="'+embed('https://pahe.example/e/episode')+'">AnimePahe</option>';
 assert.deepEqual([...episodePlayerUrls(html,'https://animotvslash.org/episode-3/')],['https://player.example/e/episode']);
});
const evidence={trustedPlayer:true,expected:90,source:90,output:90.05,video:90,audio:90.05};
test('complete short must match source, container, video and audio',()=>assert.equal(confirmedHlsShort(evidence),true));
test('truncated audio/video, mismatched source and unknown provenance are rejected',()=>{
 for (const patch of [{trustedPlayer:false},{expected:null},{source:120},{output:60},{video:60},{audio:30},{audio:NaN},{expected:20},{expected:300}])
  assert.equal(confirmedHlsShort({...evidence,...patch}),false);
});
