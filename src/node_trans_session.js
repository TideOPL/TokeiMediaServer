//
//  Created by Mingliang Chen on 18/3/9.
//  illuspas[a]gmail.com
//  Copyright (c) 2018 Nodemedia. All rights reserved.
//
const Logger = require('./node_core_logger');

const EventEmitter = require('events');
const { spawn } = require('child_process');
const dateFormat = require('dateformat');
const mkdirp = require('mkdirp');
const fs = require('fs');

const isHlsFile = (filename) => filename.endsWith('.ts') || filename.endsWith('.m3u8')
const isTemFiles = (filename) => filename.endsWith('.tmp')
const isDashFile = (filename) => filename.endsWith('.mpd') || filename.endsWith('.m4s')

class NodeTransSession extends EventEmitter {
  constructor(conf) {
    super();
    this.conf = conf;
    this.getConfig = (key = null) => {
      if (!key) return
      if (typeof this.conf != 'object') return
      if (this.conf.args && typeof this.conf.args === 'object' && this.conf.args[key]) return this.conf.args[key]
      return this.conf[key]
    }
  }

  run() {
    let vc = this.conf.vc || 'copy';
    let ac = this.conf.ac || 'copy';
    let inPath = 'rtmp://127.0.0.1:' + this.conf.rtmpPort + this.conf.streamPath;
    let ouPath = `${this.conf.mediaroot}/${this.conf.streamApp}/${this.conf.streamName}`;
    let mapStr = '';
    let mapThumb = '';

    if (this.conf.rtmp && this.conf.rtmpApp) {
      if (this.conf.rtmpApp === this.conf.streamApp) {
        Logger.error('[Transmuxing RTMP] Cannot output to the same app.');
      } else {
        let rtmpOutput = `rtmp://127.0.0.1:${this.conf.rtmpPort}/${this.conf.rtmpApp}/${this.conf.streamName}`;
        mapStr += `[f=flv]${rtmpOutput}|`;
        Logger.log('[Transmuxing RTMP] ' + this.conf.streamPath + ' to ' + rtmpOutput);
      }
    }
    if (this.conf.mp4) {
      this.conf.mp4Flags = this.conf.mp4Flags ? this.conf.mp4Flags : '';
      let mp4FileName = dateFormat('yyyy-mm-dd-HH-MM-ss') + '.mp4';
      let mapMp4 = `${this.conf.mp4Flags}${ouPath}/${mp4FileName}|`;
      mapStr += mapMp4;
      Logger.log('[Transmuxing MP4] ' + this.conf.streamPath + ' to ' + ouPath + '/' + mp4FileName);
    }
    if (this.conf.hls) {
      this.conf.hlsFlags = this.getConfig('hlsFlags') || '';
      let hlsFileName = 'index.m3u8';
      let mapHls = `${this.conf.hlsFlags}${ouPath}/${hlsFileName}`;
      mapThumb = `${this.conf.hlsFlags}${ouPath}/thumb.png`;
      mapStr += mapHls;
      Logger.log('[Transmuxing HLS] ' + this.conf.streamPath + ' to ' + ouPath + '/' + hlsFileName);
    }
    if (this.conf.dash) {
      this.conf.dashFlags = this.conf.dashFlags ? this.conf.dashFlags : '';
      let dashFileName = 'index.mpd';
      let mapDash = `${this.conf.dashFlags}${ouPath}/${dashFileName}`;
      mapStr += mapDash;
      Logger.log('[Transmuxing DASH] ' + this.conf.streamPath + ' to ' + ouPath + '/' + dashFileName);
    }
    mkdirp.sync(ouPath);
    let argv = ['-i', inPath];
    // Array.prototype.push.apply(argv, ['-c:v', vc]);
    // Array.prototype.push.apply(argv, this.conf.vcParam);
    // Array.prototype.push.apply(argv, ['-c:a', ac]);
    // Array.prototype.push.apply(argv, this.conf.acParam);
    Array.prototype.push.apply(argv, ['-c:v', 'h264', '-preset:v', 'ultrafast', '-c:a', 'aac', '-strict', '-2', '-f', 'hls', '-x264-params', 'keyint=15:min-keyint=15', '-hls_time', '1', '-hls_flags', 'delete_segments', '-hls_list_size', '20', '-http_persistent', '0', '-vf', 'select=\'not(mod(n\,300))\'thumbnail', '-vsync', 'vfr', '-frames:v', '1', this.conf.streamPath + '/hello.jpg', mapStr]);
    Array.prototype.push.apply(argw, ['-y', '-vf', 'fps=1/60', '-update', '1', '-vframes', '1', mapThumb])
    argv = argv.filter((n) => { return n; });
    
    this.ffmpeg_exec = spawn(this.conf.ffmpeg, argv);
    this.ffmpeg_execw = spawn(this.conf.ffmpeg, argw);
    this.ffmpeg_exec.on('error', (e) => {
      Logger.debug(e);
    });

    this.ffmpeg_exec.stdout.on('data', (data) => {
      Logger.debug(`FF_LOG:${data}`);
    });

    this.ffmpeg_exec.stderr.on('data', (data) => {
      Logger.debug(`FF_LOG:${data}`);
    });

    this.ffmpeg_exec.on('close', (code) => {
      Logger.log('[Transmuxing end] ' + this.conf.streamPath);
      this.emit('end');
      this.cleanTempFiles(ouPath)
      this.deleteHlsFiles(ouPath)
    });
  }

  end() {
    this.ffmpeg_exec.kill();
    this.ffmpeg_execw.kill();
  }

  // delete hls files
  deleteHlsFiles (ouPath) {
    if ((!ouPath && !this.conf.hls) || this.getConfig('hlsKeep')) return
    fs.readdir(ouPath, function (err, files) {
      if (err) return
      files.filter((filename) => isHlsFile(filename)).forEach((filename) => {
        fs.unlinkSync(`${ouPath}/${filename}`);
      });
    });
  }

  // delete the other files
  cleanTempFiles (ouPath) {
    if (!ouPath) return
    var _this = this;
    fs.readdir(ouPath, function (err, files) {
      if (err) return
      if(_this.getConfig('dashKeep')){
        files.filter((filename) => isTemFiles(filename)).forEach((filename) => {
          fs.unlinkSync(`${ouPath}/${filename}`);
        });
      }
      else {
        files.filter((filename) => isTemFiles(filename)||isDashFile(filename)).forEach((filename) => {
          fs.unlinkSync(`${ouPath}/${filename}`);
        });
      }
    });
  }
}

module.exports = NodeTransSession;