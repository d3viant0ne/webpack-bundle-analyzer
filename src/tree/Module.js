import _ from 'lodash';
import {getCompressedSize} from '../sizeUtils';

import Node from './Node';

export default class Module extends Node {

  constructor(name, data, parent, opts) {
    super(name, parent);
    this.data = data;
    this.opts = opts;
  }

  get src() {
    return this.data.parsedSrc;
  }

  set src(value) {
    this.data.parsedSrc = value;
    delete this._gzipSize;
    delete this._brotliSize;
  }

  get size() {
    return this.data.size;
  }

  set size(value) {
    this.data.size = value;
  }

  get parsedSize() {
    return this.src ? this.src.length : undefined;
  }

  get gzipSize() {
    return this.opts.compressionAlgorithm === 'gzip' ? this.getCompressedSize('gzip') : undefined;
  }

  get brotliSize() {
    return this.opts.compressionAlgorithm === 'brotli' ? this.getCompressedSize('brotli') : undefined;
  }

  getCompressedSize(compressionAlgorithm) {
    const key = `_${compressionAlgorithm}Size`;
    if (!_.has(this, key)) {
      this[key] = this.src ? getCompressedSize(compressionAlgorithm, this.src) : undefined;
    }

    return this[key];
  }

  mergeData(data) {
    if (data.size) {
      this.size += data.size;
    }

    if (data.parsedSrc) {
      this.src = (this.src || '') + data.parsedSrc;
    }
  }

  toChartData() {
    return {
      id: this.data.id,
      label: this.name,
      path: this.path,
      statSize: this.size,
      parsedSize: this.parsedSize,
      gzipSize: this.gzipSize,
      brotliSize: this.brotliSize
    };
  }

};
