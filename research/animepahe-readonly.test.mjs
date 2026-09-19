import test from 'node:test';
import assert from 'node:assert/strict';
import {probe, parseAiring, origin} from './animepahe-readonly.mjs';
const response = (status, text) => ({status, text: async () => text});
test('security block stops before any API request, including HTTP 200 challenge pages', async () => {
  for (const status of [403, 200]) {
    const calls = [];
    const report = await probe(async (url, options) => {
      calls.push(url);
      assert.equal(options.method, 'GET');
      assert.equal(options.redirect, 'manual');
      return response(status, '<h1>Sorry, you have been blocked</h1>');
    });
    assert.deepEqual(calls, [origin + '/']);
    assert.equal(report.result, 'blocked');
    assert.equal(report.ready_for_switch, false);
  }
});
test('empty data and malformed JSON cannot pass discovery', async () => {
  for (const [text, expected] of [['{"data":[]}', 'no_candidates'], ['<html>oops</html>', 'invalid_feed']]) {
    let call = 0;
    const report = await probe(async () => ++call === 1 ? response(200, '<html>home</html>') : response(200, text));
    assert.equal(report.result, expected);
    assert.equal(report.ready_for_switch, false);
  }
});
test('synthetic feed rejects invalid IDs, deduplicates, and retains fractional episodes', () => {
  const valid = {anime_title:'Fixture anime',anime_id:123,episode:12.5,session:'fixture-session'};
  const rows = parseAiring({data:[valid, valid, {...valid, anime_id:'../other'}, {...valid, session:'x/y'}, {title:'Navigation'}]});
  assert.equal(rows.length, 1);
  assert.equal(rows[0].episode, 12.5);
  assert.equal(rows[0].play_url, origin + '/play/123/fixture-session');
});
test('successful synthetic discovery still cannot authorize a source switch', async () => {
  let call = 0;
  const report = await probe(async () => ++call === 1 ? response(200, 'home') :
    response(200, JSON.stringify({data:[{anime_title:'Fixture',anime_id:1,episode:1,session:'abc'}]})));
  assert.equal(report.result, 'discovery_only');
  assert.equal(report.ready_for_switch, false);
  assert.equal(report.media_download, 'not_tested');
  assert.equal(report.facebook_publish, 'not_tested');
});
