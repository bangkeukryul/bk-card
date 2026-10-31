/*!
 * mp4mux.js — 최소 MP4 muxer (외부 라이브러리 없음)
 * WebCodecs 가 만든 H.264 영상 + AAC/Opus 오디오 조각을 하나의 .mp4 파일로 묶습니다.
 * moov 를 앞쪽에 두는 "fast start" 구조라서 휴대폰·SNS 업로드에서 바로 재생됩니다.
 */
(function (g) {
  'use strict';
  const te = new TextEncoder();

  function u8(v) { return new Uint8Array([v & 255]); }
  function u16(v) { const b = new Uint8Array(2); new DataView(b.buffer).setUint16(0, v & 0xffff); return b; }
  function i16(v) { const b = new Uint8Array(2); new DataView(b.buffer).setInt16(0, v); return b; }
  function u32(v) { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, v >>> 0); return b; }
  function i32(v) { const b = new Uint8Array(4); new DataView(b.buffer).setInt32(0, v | 0); return b; }
  function zeros(n) { return new Uint8Array(n); }
  function cc(s) { return te.encode(s); }
  function cat(parts) {
    let n = 0;
    for (const p of parts) n += p.length;
    const o = new Uint8Array(n);
    let off = 0;
    for (const p of parts) { o.set(p, off); off += p.length; }
    return o;
  }
  function flat(parts) {
    const out = [];
    (function walk(a) { for (const p of a) { if (Array.isArray(p)) walk(p); else if (p) out.push(p); } })(parts);
    return out;
  }
  function box(type, ...parts) {
    const body = cat(flat(parts));
    return cat([u32(8 + body.length), cc(type), body]);
  }
  function fbox(type, ver, flags, ...parts) {
    return box(type, new Uint8Array([ver, (flags >> 16) & 255, (flags >> 8) & 255, flags & 255]), ...parts);
  }
  const MATRIX = cat([u32(0x00010000), u32(0), u32(0), u32(0), u32(0x00010000), u32(0), u32(0), u32(0), u32(0x40000000)]);

  function toU8(d) {
    if (!d) return null;
    if (d instanceof ArrayBuffer) return new Uint8Array(d.slice(0));
    if (ArrayBuffer.isView(d)) return new Uint8Array(d.buffer.slice(d.byteOffset, d.byteOffset + d.byteLength));
    return null;
  }

  const AAC_RATES = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];
  // AAC-LC AudioSpecificConfig 를 직접 만든다 (일부 브라우저가 잘못된 description 을 주는 문제 회피)
  function aacASC(sr, ch) {
    let fi = AAC_RATES.indexOf(sr);
    if (fi < 0) fi = 3;
    const v = (2 << 11) | (fi << 7) | (ch << 3);
    return new Uint8Array([(v >> 8) & 255, v & 255]);
  }

  class Mp4Muxer {
    /**
     * @param {{video?:{width:number,height:number}, audio?:{codec:'aac'|'opus', sampleRate:number, numberOfChannels:number, bitrate?:number}}} cfg
     */
    constructor(cfg) {
      this.tracks = [];
      if (cfg.video) {
        this.video = { kind: 'video', id: 0, timescale: 90000, samples: [], desc: null, ...cfg.video };
        this.tracks.push(this.video);
      }
      if (cfg.audio) {
        this.audio = { kind: 'audio', id: 0, samples: [], desc: null, bitrate: 128000, ...cfg.audio };
        this.audio.timescale = this.audio.sampleRate;
        this.tracks.push(this.audio);
      }
      this.tracks.forEach((t, i) => { t.id = i + 1; });
    }

    _add(tr, chunk, meta) {
      if (!tr.desc && meta && meta.decoderConfig && meta.decoderConfig.description) tr.desc = toU8(meta.decoderConfig.description);
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      tr.samples.push({ data, ts: chunk.timestamp, dur: chunk.duration || 0, key: chunk.type === 'key' });
    }
    addVideoChunk(chunk, meta) { this._add(this.video, chunk, meta); }
    addAudioChunk(chunk, meta) { this._add(this.audio, chunk, meta); }
    /** 테스트/특수 용도: 원시 샘플 직접 추가 (timestamp/duration 은 마이크로초) */
    addRawSample(kind, data, tsUs, durUs, key, description) {
      const tr = kind === 'video' ? this.video : this.audio;
      if (description && !tr.desc) tr.desc = toU8(description);
      tr.samples.push({ data, ts: tsUs, dur: durUs || 0, key: !!key });
    }

    _prep(tr) {
      const s = tr.samples;
      const n = s.length;
      const ts = tr.timescale;
      const pts = s.map(x => Math.round(x.ts * ts / 1e6));
      let mono = true;
      for (let i = 1; i < n; i++) if (pts[i] <= pts[i - 1]) { mono = false; break; }
      const dts = mono ? pts.slice() : pts.slice().sort((a, b) => a - b);
      const base = dts[0];
      for (let i = 0; i < n; i++) { dts[i] -= base; pts[i] -= base; }
      const durs = new Array(n);
      for (let i = 0; i < n - 1; i++) durs[i] = Math.max(1, dts[i + 1] - dts[i]);
      const lastDur = Math.round(s[n - 1].dur * ts / 1e6);
      durs[n - 1] = lastDur > 0 ? lastDur : (n > 1 ? durs[n - 2] : Math.round(ts / 30));
      const offs = mono ? null : pts.map((p, i) => p - dts[i]);
      let total = 0;
      for (const d of durs) total += d;
      // 0.5초 단위 청크로 묶기
      const chunks = [];
      let cur = null;
      for (let i = 0; i < n; i++) {
        if (!cur || dts[i] - cur.t0 >= ts * 0.5) {
          cur = { tr, first: i, count: 0, t0: dts[i], sec: dts[i] / ts, size: 0 };
          chunks.push(cur);
        }
        cur.count++;
        cur.size += s[i].data.length;
      }
      return { durs, offs, total, chunks };
    }

    _sampleEntry(tr) {
      if (tr.kind === 'video') {
        if (!tr.desc) throw new Error('H.264 설정 정보(avcC)가 없습니다.');
        return box('avc1', zeros(6), u16(1), u16(0), u16(0), zeros(12), u16(tr.width), u16(tr.height),
          u32(0x00480000), u32(0x00480000), u32(0), u16(1), zeros(32), u16(0x18), i16(-1),
          box('avcC', tr.desc));
      }
      const head = [zeros(6), u16(1), zeros(8), u16(tr.numberOfChannels), u16(16), u16(0), u16(0), u32(tr.sampleRate * 65536)];
      if (tr.codec === 'opus') {
        let preskip = 3840, inRate = tr.sampleRate;
        const d = tr.desc;
        if (d && d.length >= 19 && String.fromCharCode(...d.slice(0, 8)) === 'OpusHead') {
          const dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
          preskip = dv.getUint16(10, true);
          inRate = dv.getUint32(12, true);
        }
        return box('Opus', head, box('dOps', u8(0), u8(tr.numberOfChannels), u16(preskip), u32(inRate), i16(0), u8(0)));
      }
      // AAC
      const asc = aacASC(tr.sampleRate, tr.numberOfChannels);
      const dsi = cat([u8(0x05), u8(asc.length), asc]);
      const dcd = cat([u8(0x04), u8(13 + dsi.length), u8(0x40), u8(0x15), zeros(3), u32(tr.bitrate), u32(tr.bitrate), dsi]);
      const sl = new Uint8Array([0x06, 0x01, 0x02]);
      const es = cat([u8(0x03), u8(3 + dcd.length + sl.length), u16(tr.id), u8(0), dcd, sl]);
      return box('mp4a', head, fbox('esds', 0, 0, es));
    }

    _trak(tr, p, chunkOffsets) {
      const n = tr.samples.length;
      const movieDur = Math.round(p.total / tr.timescale * 1000);
      const isV = tr.kind === 'video';
      const tkhd = fbox('tkhd', 0, 3, u32(0), u32(0), u32(tr.id), u32(0), u32(movieDur), zeros(8),
        u16(0), u16(0), u16(isV ? 0 : 0x0100), u16(0), MATRIX,
        u32(isV ? tr.width * 65536 : 0), u32(isV ? tr.height * 65536 : 0));
      const mdhd = fbox('mdhd', 0, 0, u32(0), u32(0), u32(tr.timescale), u32(p.total), u16(0x55c4), u16(0));
      const hdlr = fbox('hdlr', 0, 0, u32(0), cc(isV ? 'vide' : 'soun'), zeros(12), cc(isV ? 'VideoHandler' : 'SoundHandler'), u8(0));
      const xmhd = isV ? fbox('vmhd', 0, 1, u16(0), zeros(6)) : fbox('smhd', 0, 0, u16(0), u16(0));
      const dinf = box('dinf', fbox('dref', 0, 0, u32(1), fbox('url ', 0, 1)));
      // stts (실행 길이 압축)
      const stts = [];
      for (const d of p.durs) {
        const last = stts[stts.length - 1];
        if (last && last[1] === d) last[0]++; else stts.push([1, d]);
      }
      const parts = [
        fbox('stsd', 0, 0, u32(1), this._sampleEntry(tr)),
        fbox('stts', 0, 0, u32(stts.length), stts.map(([c, d]) => [u32(c), u32(d)])),
      ];
      if (isV) {
        const keys = [];
        tr.samples.forEach((s, i) => { if (s.key) keys.push(i + 1); });
        if (keys.length < n) parts.push(fbox('stss', 0, 0, u32(keys.length), keys.map(k => u32(k))));
      }
      if (p.offs && p.offs.some(o => o !== 0)) {
        const runs = [];
        for (const o of p.offs) {
          const last = runs[runs.length - 1];
          if (last && last[1] === o) last[0]++; else runs.push([1, o]);
        }
        parts.push(fbox('ctts', 1, 0, u32(runs.length), runs.map(([c, o]) => [u32(c), i32(o)])));
      }
      const stsc = [];
      p.chunks.forEach((c, j) => {
        const last = stsc[stsc.length - 1];
        if (!last || last[1] !== c.count) stsc.push([j + 1, c.count]);
      });
      parts.push(fbox('stsc', 0, 0, u32(stsc.length), stsc.map(([f, c]) => [u32(f), u32(c), u32(1)])));
      parts.push(fbox('stsz', 0, 0, u32(0), u32(n), tr.samples.map(s => u32(s.data.length))));
      parts.push(fbox('stco', 0, 0, u32(chunkOffsets.length), chunkOffsets.map(o => u32(o))));
      const stbl = box('stbl', parts);
      return box('trak', tkhd, box('mdia', mdhd, hdlr, box('minf', xmhd, dinf, stbl)));
    }

    /** @returns {Uint8Array[]} new Blob(parts, {type:'video/mp4'}) 로 사용 */
    finalize() {
      const tracks = this.tracks.filter(t => t.samples.length);
      if (!tracks.length) throw new Error('인코딩된 데이터가 없습니다.');
      const preps = new Map(tracks.map(t => [t, this._prep(t)]));
      // 트랙 청크를 시간순으로 섞어서(interleave) 배치
      const all = [];
      for (const t of tracks) for (const c of preps.get(t).chunks) all.push(c);
      all.sort((a, b) => a.sec - b.sec || a.tr.id - b.tr.id);
      const ftyp = box('ftyp', cc('isom'), u32(0x200), cc('isom'), cc('iso2'), cc('avc1'), cc('mp41'));
      const build = (offsetsFor) => {
        let maxDur = 0;
        for (const t of tracks) maxDur = Math.max(maxDur, Math.round(preps.get(t).total / t.timescale * 1000));
        const mvhd = fbox('mvhd', 0, 0, u32(0), u32(0), u32(1000), u32(maxDur), u32(0x00010000), u16(0x0100),
          zeros(10), MATRIX, zeros(24), u32(this.tracks.length + 1));
        return box('moov', mvhd, tracks.map(t => this._trak(t, preps.get(t), offsetsFor(t))));
      };
      const placeholder = t => preps.get(t).chunks.map(() => 0);
      const moovSize = build(placeholder).length;
      let mdatSize = 8;
      for (const c of all) mdatSize += c.size;
      if (ftyp.length + moovSize + mdatSize > 0xffffffff) throw new Error('파일이 너무 큽니다 (4GB 초과).');
      let pos = ftyp.length + moovSize + 8;
      for (const c of all) { c.offset = pos; pos += c.size; }
      const moov = build(t => preps.get(t).chunks.map(c => c.offset));
      const out = [ftyp, moov, cat([u32(mdatSize), cc('mdat')])];
      for (const c of all) for (let i = c.first; i < c.first + c.count; i++) out.push(c.tr.samples[i].data);
      return out;
    }
  }

  g.Mp4Muxer = Mp4Muxer;
})(typeof window !== 'undefined' ? window : globalThis);
