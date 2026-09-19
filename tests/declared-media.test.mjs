import { test } from 'node:test';
import assert from 'node:assert/strict';
import { declaredMedia } from '../scripts/animotvslash-declared-media.mjs';
const episode = 'https://animotvslash.org/example-episode-12/';
const config = {url_1080:'https://cdn.example/video.mp4',url_480:'https://cdn.example/480.mp4',download_url:'https://example.org/download'};
const iframe = '<iframe src="https://animotvslash.org/vidstack-player/' + Buffer.from(JSON.stringify(config)).toString('base64url') + '"></iframe>';
test('reads non-active mirror configuration and preserves quality order', () => {
 const html = '<select class="mirror"><option value="' + Buffer.from(iframe).toString('base64') + '">Mirror</option></select>';
 assert.deepEqual(declaredMedia(html,episode),[config.url_1080,config.url_480]);
});
test('deduplicates and ignores foreign player configurations', () => {
 assert.deepEqual(declaredMedia(iframe+iframe,episode),[config.url_1080,config.url_480]);
 assert.deepEqual(declaredMedia(iframe.replace('animotvslash.org','foreign.example'),episode),[]);
});
test('ignores malformed options and non-media configuration fields', () => {
 assert.deepEqual(declaredMedia('<option value="malformed">bad</option>',episode),[]);
 const p=Buffer.from(JSON.stringify({url:'http://example.org/x.mp4',download_url:'https://example.org/x.mp4'})).toString('base64url');
 assert.deepEqual(declaredMedia('<iframe src="/plyr-player/'+p+'"></iframe>',episode),[]);
});
