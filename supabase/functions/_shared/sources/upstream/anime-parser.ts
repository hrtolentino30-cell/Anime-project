import { sha256 } from '../../hash.ts';
import type { AnimeData, CharacterData, EpisodeRef } from '../../types.ts';
import { UpstreamClient } from './client.ts';
import { clean, firstMeta, labelValue, load, scrubSourceLabel, slugFromUrl, sourceId, toDate, toNumber } from './parser.ts';

function splitNames(value?: string): string[] {
  if (!value) return [];
  return [...new Set(value.split(/[,;|]/).map(v => clean(v)).filter(Boolean) as string[])];
}

function parseYear(released?: string) {
  const m = released?.match(/\b(19|20|21)\d{2}\b/);
  return m ? Number(m[0]) : undefined;
}

function episodeNumberFromUrl(url: string, fallbackText = '') {
  const path = new URL(url).pathname;
  const m = path.match(/-episode-(\d+(?:\.\d+)?)\/?$/i) ?? fallbackText.match(/(?:Episode|Ep\.?|Eps)\s*(\d+(?:\.\d+)?)/i);
  return m ? Number(m[1]) : undefined;
}

function ratioFromUrl(src?: string) {
  if (!src) return undefined;
  const m = src.match(/[-_](\d{2,4})x(\d{2,4})(?=[._-]|$)/i);
  if (!m) return undefined;
  const width = Number(m[1]), height = Number(m[2]);
  return height > 0 ? width / height : undefined;
}

function unique(values: Array<string | undefined | null>) {
  return [...new Set(values.map(v => clean(v)).filter(Boolean) as string[])];
}

export async function parseAnime(html: string, url: string, client: UpstreamClient): Promise<AnimeData> {
  const $ = load(html);
  const doc = $.root();
  const main = $('main,article,.postbody,.animefull,.bigcontent').first();
  const root = main.length ? main : doc;
  const bodyText = root.text().replace(/\s+/g, ' ').trim();
  const title = scrubSourceLabel(clean(root.find('h1').first().text()) ?? firstMeta($, { property: 'og:title' }), client.baseUrl) ?? slugFromUrl(url).replace(/-/g, ' ');
  const ogImage = firstMeta($, { property: 'og:image' });

  const normalizedTitle = title.toLowerCase().replace(/\s+/g, ' ').trim();
  const imageCandidates = root.find('img').toArray().map((img, index) => {
    const el = $(img);
    const src = el.attr('data-src') ?? el.attr('data-lazy-src') ?? el.attr('data-original') ?? el.attr('src');
    if (!src) return null;
    const alt = clean(el.attr('alt')) ?? '';
    const width = Number.parseFloat(el.attr('width') ?? el.attr('data-width') ?? '');
    const height = Number.parseFloat(el.attr('height') ?? el.attr('data-height') ?? '');
    const ratio = Number.isFinite(width) && Number.isFinite(height) && height > 0 ? width / height : ratioFromUrl(src);
    const context = [src, alt, el.attr('class'), el.parent().attr('class'), el.closest('figure,div,li').attr('class')].filter(Boolean).join(' ').toLowerCase();
    const altNormalized = alt.toLowerCase().replace(/\s+/g, ' ').trim();
    const obviousWide = /backdrop|wide|landscape|banner|hero|slider|header|wallpaper/i.test(context);
    const obviousNonPoster = /\blogo\b|episode|thumbnail|\bthumb\b|screenshot|avatar|\bicon\b/i.test(context);
    let posterScore = 0;
    if (/(?:^|[-_\s])(poster|cover)(?:[-_\s.]|$)/i.test(context)) posterScore += 14;
    if (/key[-_\s]?visual|teaser[-_\s]?visual|main[-_\s]?visual/i.test(context)) posterScore += 9;
    if (altNormalized && (altNormalized === normalizedTitle || altNormalized.includes(normalizedTitle) || normalizedTitle.includes(altNormalized))) posterScore += 10;
    if (ratio != null) {
      if (ratio <= 0.82) posterScore += 14;
      else if (ratio <= 1) posterScore += 6;
      else if (ratio >= 1.15) posterScore -= 18;
    }
    if (obviousWide) posterScore -= 28;
    if (obviousNonPoster) posterScore -= 12;
    return { src, index, ratio, context, obviousWide, obviousNonPoster, posterScore };
  }).filter(Boolean) as Array<{ src: string; index: number; ratio?: number; context: string; obviousWide: boolean; obviousNonPoster: boolean; posterScore: number }>;

  if (ogImage && !imageCandidates.some(c => c.src === ogImage)) {
    const context = `og-image ${ogImage}`.toLowerCase();
    const obviousWide = /backdrop|wide|landscape|banner|hero|slider|header|wallpaper/i.test(context);
    const obviousNonPoster = /\blogo\b|episode|thumbnail|\bthumb\b|screenshot|avatar|\bicon\b/i.test(context);
    const ratio = ratioFromUrl(ogImage);
    imageCandidates.push({ src: ogImage, index: imageCandidates.length + 1000, ratio, context, obviousWide, obviousNonPoster, posterScore: obviousWide || (ratio != null && ratio >= 1.15) ? -24 : 1 });
  }

  const posterCandidate = [...imageCandidates]
    .filter(c => !c.obviousWide && !c.obviousNonPoster && !(c.ratio != null && c.ratio >= 1.15))
    .sort((a, b) => b.posterScore - a.posterScore || a.index - b.index)[0];

  const style = root.find('[style*="background-image"]').first().attr('style');
  const bannerMatch = style?.match(/url\(["']?([^"')]+)["']?\)/i);
  const styleBanner = bannerMatch?.[1];
  const styleBannerRatio = ratioFromUrl(styleBanner);
  const inferredBanner = [...imageCandidates]
    .filter(c => (c.obviousWide || (c.ratio != null && c.ratio >= 1.2)) && !(c.ratio != null && c.ratio < 1.05))
    .sort((a, b) => {
      const score = (c: typeof a) => (c.obviousWide ? 12 : 0) + (c.ratio != null && c.ratio >= 1.2 ? 8 : 0) - (/\blogo\b|episode|thumbnail|\bthumb\b|avatar|\bicon\b/i.test(c.context) ? 12 : 0);
      return score(b) - score(a) || a.index - b.index;
    })[0]?.src;

  const poster = posterCandidate?.src;
  const banner = styleBanner && !(styleBannerRatio != null && styleBannerRatio < 1.05) ? styleBanner : inferredBanner;
  const status = labelValue(bodyText, 'Status');
  const studioRaw = labelValue(bodyText, 'Studio');
  const released = labelValue(bodyText, 'Released');
  const season = labelValue(bodyText, 'Season');
  const type = labelValue(bodyText, 'Type');
  const duration = labelValue(bodyText, 'Duration');
  const episodesRaw = labelValue(bodyText, 'Episodes');
  const updatedRaw = bodyText.match(/Updated on:\s*([^|]+?)(?=\s+(?:Released on:|Synopsis|Genres|$))/i)?.[1];
  const synopsisHeading = doc.find('h2,h3,h4').filter((_, el) => /synopsis/i.test($(el).text())).first();
  let description = scrubSourceLabel(clean(synopsisHeading.nextAll('p').first().text()), client.baseUrl);
  if (!description) description = scrubSourceLabel(firstMeta($, { name: 'description' }), client.baseUrl);

  const explicitAltNodes = doc.find('.alter,.alternative,.alternative-title,.alternative-titles,.anime-alt-title,[class*="alter"]');
  const titleNode = doc.find('h1').first();
  const altTextCandidates = unique([
    ...explicitAltNodes.toArray().map(e => scrubSourceLabel(clean($(e).text()), client.baseUrl)),
    ...titleNode.nextAll('p,div,span').slice(0, 12).toArray().map(e => scrubSourceLabel(clean($(e).text()), client.baseUrl)),
    ...titleNode.parent().find('p,div,span').slice(0, 18).toArray().map(e => scrubSourceLabel(clean($(e).text()), client.baseUrl)),
  ]).filter(v => v !== title && v.length < 600 && !/Status:|Released:|Duration:|Type:|Genres:|Watch full episodes|stream |download |Synopsis|Episode\s+\d+/i.test(v));
  const altRaw = altTextCandidates.find(v => /[\u3040-\u30ff\u3400-\u9fff]/.test(v) || /[,，、]/.test(v));
  const alternativeTitles = splitNames(altRaw?.replace(/[、，]/g, ',')).filter(v => v.toLowerCase() !== title.toLowerCase());
  const titleJapanese = alternativeTitles.find(v => /[\u3040-\u30ff\u3400-\u9fff]/.test(v));
  const titleEnglish = alternativeTitles.find(v => /^[\x00-\x7F]+$/.test(v) && v.toLowerCase() !== title.toLowerCase());

  const genreSelector = 'a[href*="/genres/"],a[href*="/genre/"]';
  let genreNodes = root.find(`.genxed ${genreSelector},.genres ${genreSelector},.genre-info ${genreSelector},[class*="genre"] ${genreSelector}`);
  if (!genreNodes.length) {
    const firstGenre = root.find(genreSelector).first();
    const genreBox = firstGenre.closest('p,li,span,div').first();
    genreNodes = genreBox.length ? genreBox.find(genreSelector) : root.find(genreSelector).slice(0, 10);
  }
  const genres = unique(genreNodes.toArray().map(a => clean($(a).text()))).slice(0, 20);
  const studiosFromLinks = root.find('a[href*="/studio/"]').toArray().map(a => clean($(a).text())).filter(Boolean) as string[];
  const studios = [...new Set(studiosFromLinks.length ? studiosFromLinks : splitNames(studioRaw))];

  const episodeRefs: EpisodeRef[] = [];
  for (const a of root.find('a[href*="episode-"]').toArray()) {
    const href = $(a).attr('href');
    if (!href) continue;
    const sourceUrl = client.absolute(href);
    const num = episodeNumberFromUrl(sourceUrl, $(a).text());
    if (num == null) continue;
    const row = $(a).closest('li,tr,.eplister,.episodelist,.episode-item').first();
    const textValue = (row.length ? row.text() : $(a).text()).replace(/\s+/g, ' ').trim();
    const dateMatch = textValue.match(/\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},\s+\d{4}\b/i);
    episodeRefs.push({
      sourceId: sourceId('episode', sourceUrl), sourceUrl, episodeNumber: num,
      title: scrubSourceLabel(clean($(a).attr('title')) ?? clean($(a).text().replace(/^\s*\d+(?:\.\d+)?\s*/, '')), client.baseUrl),
      airDate: toDate(dateMatch?.[0]),
      thumbnailUrl: row.find('img').first().attr('data-src') ?? row.find('img').first().attr('src') ?? undefined,
      fingerprint: await sha256({ sourceUrl, text: textValue }),
    });
  }

  const uniqueEpisodes = [...new Map(episodeRefs.map(e => [e.sourceUrl, e])).values()].sort((a, b) => a.episodeNumber - b.episodeNumber);
  const relatedAnimeUrls = [...new Set(root.find('a[href*="/anime/"]').toArray().map(a => client.absolute($(a).attr('href')!)).filter(u => u !== url))].slice(0, 50);
  const characters: CharacterData[] = [];
  const originLabel = client.baseUrl.hostname.replace(/^www\./, '').split('.')[0].toLowerCase();

  const personImage = (name: string) => {
    const lowered = name.toLowerCase();
    const img = doc.find('img[alt]').filter((_, node) => (clean($(node).attr('alt')) ?? '').toLowerCase() === lowered).first();
    if (!img.length) return {};
    const src = img.attr('data-src') ?? img.attr('data-lazy-src') ?? img.attr('src') ?? undefined;
    const href = img.closest('a[href]').attr('href');
    return { imageUrl: src, href };
  };

  const normalizedDocumentText = doc.text().replace(/\s+/g, ' ').trim();
  const characterSectionText = normalizedDocumentText.match(/Characters?\s*(?:&|and)\s*Voice Actors?\s+(.+?)(?=\s+History\b|\s+Watch\s+)/i)?.[1];
  if (characterSectionText) {
    const parts = characterSectionText.split(/\b(Main|Supporting|Japanese|English)\b/i);
    for (let i = 1; i < parts.length; i++) {
      const marker = parts[i]?.trim().toLowerCase();
      if (marker !== 'main' && marker !== 'supporting') continue;
      const characterName = clean(parts[i - 1]);
      const voiceName = clean(parts[i + 1]);
      const languageToken = parts[i + 2]?.trim();
      const language = /^(Japanese|English)$/i.test(languageToken ?? '') ? languageToken : undefined;
      if (!characterName || characterName.length > 120 || characterName.toLowerCase().includes(originLabel)) continue;
      const characterImage = personImage(characterName);
      const character: CharacterData = {
        sourceId: sourceId('character', characterImage.href ? client.absolute(characterImage.href) : `/character/${encodeURIComponent(characterName)}/`),
        name: characterName,
        imageUrl: characterImage.imageUrl,
        role: marker === 'main' ? 'Main' : 'Supporting',
        voiceActors: [],
      };
      if (voiceName && language && voiceName.length < 120 && voiceName.toLowerCase() !== characterName.toLowerCase()) {
        const voiceImage = personImage(voiceName);
        character.voiceActors!.push({
          sourceId: voiceImage.href ? sourceId('voice', client.absolute(voiceImage.href)) : `voice:${voiceName.toLowerCase()}:${language.toLowerCase()}`,
          name: voiceName,
          language,
          imageUrl: voiceImage.imageUrl,
        });
        i += 2;
      }
      if (!characters.some(c => c.name.toLowerCase() === character.name.toLowerCase())) characters.push(character);
    }
  }

  if (!characters.length) {
    const characterHeading = doc.find('h2,h3,h4').filter((_, el) => /characters?\s*(?:&|and)?\s*voice actors?/i.test($(el).text())).first();
    let characterImages = characterHeading.length ? characterHeading.nextUntil('h2,h3,h4').find('img').toArray() : [];
    if (!characterImages.length) {
      characterImages = doc.find('img').toArray().filter(img => {
        let node = $(img).parent();
        for (let depth = 0; depth < 5 && node.length; depth++, node = node.parent()) {
          const txt = clean(node.text());
          if (txt && txt.length < 600 && /\b(Main|Supporting|Japanese|English)\b/i.test(txt)) return true;
        }
        return false;
      });
    }
    let lastCharacter: CharacterData | undefined;
    for (const img of characterImages) {
      const el = $(img);
      const alt = clean(el.attr('alt'));
      if (!alt || alt === title || alt.toLowerCase().includes(originLabel)) continue;
      let node = el.parent();
      let txt: string | undefined;
      for (let depth = 0; depth < 6 && node.length; depth++, node = node.parent()) {
        const candidate = clean(node.text());
        if (candidate && candidate.length < 600 && /\b(Main|Supporting|Japanese|English)\b/i.test(candidate)) { txt = candidate; break; }
      }
      if (!txt) continue;
      const role = /\bMain\b/i.test(txt) ? 'Main' : /\bSupporting\b/i.test(txt) ? 'Supporting' : undefined;
      const language = /\bEnglish\b/i.test(txt) ? 'English' : /\bJapanese\b/i.test(txt) ? 'Japanese' : undefined;
      const imageUrl = el.attr('data-src') ?? el.attr('data-lazy-src') ?? el.attr('src') ?? undefined;
      const href = el.closest('a[href]').attr('href');
      if (role) {
        const character: CharacterData = { sourceId: sourceId('character', href ? client.absolute(href) : `/character/${encodeURIComponent(alt)}/`), name: alt, imageUrl, role, voiceActors: [] };
        if (!characters.some(c => c.name.toLowerCase() === character.name.toLowerCase())) { characters.push(character); lastCharacter = character; }
        else lastCharacter = characters.find(c => c.name.toLowerCase() === character.name.toLowerCase());
      } else if (language && lastCharacter && alt.toLowerCase() !== lastCharacter.name.toLowerCase()) {
        lastCharacter.voiceActors ??= [];
        if (!lastCharacter.voiceActors.some(v => v.name.toLowerCase() === alt.toLowerCase() && v.language === language)) {
          lastCharacter.voiceActors.push({ sourceId: href ? sourceId('voice', client.absolute(href)) : `voice:${alt.toLowerCase()}:${language.toLowerCase()}`, name: alt, language, imageUrl });
        }
      }
    }
  }

  const latestEpisode = uniqueEpisodes.length ? Math.max(...uniqueEpisodes.map(e => e.episodeNumber)) : undefined;
  const ratingText = bodyText.match(/Rating\s*([0-9]+(?:\.[0-9]+)?)/i)?.[1];
  const metadata = { title, titleEnglish, titleJapanese, alternativeTitles, description, poster, banner, type, status, season, year: parseYear(released), rating: toNumber(ratingText), duration, totalEpisodes: toNumber(episodesRaw), latestEpisode, genres, studios, sourceUpdatedAt: toDate(clean(updatedRaw)) };

  return {
    sourceId: sourceId('anime', url), sourceUrl: url, slug: slugFromUrl(url), title, titleEnglish, titleJapanese, alternativeTitles, description,
    posterUrl: poster ? client.absolute(poster) : undefined, bannerUrl: banner ? client.absolute(banner) : undefined,
    type, status, season, year: parseYear(released), rating: toNumber(ratingText), duration, totalEpisodes: toNumber(episodesRaw), latestEpisode,
    genres, studios, characters, relatedAnimeUrls, episodeRefs: uniqueEpisodes, sourceUpdatedAt: toDate(clean(updatedRaw)),
    metadataHash: await sha256(metadata), contentHash: await sha256({ metadata, episodeRefs: uniqueEpisodes, relatedAnimeUrls }),
  };
}
