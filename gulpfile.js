'use strict';

const gulp = require('gulp');

const NODE_SRC = ['./src/**/*.js'];
const NODE_DEST = './lib';
const VIEWER_SRC = ['./client/**/*'];

const cli = require('commander')
  .usage('<task> [options]')
  .option('-e, --env <environment>', 'Can be `prod` or `dev`. Default is `dev`', /^(dev|prod)$/u, 'dev')
  .option('-a, --analyze', 'Analyze client bundle. If set, `env` will be set to `prod`.')
  .parse(process.argv);

const task = cli.args[0] || 'watch';
if (task === 'build' || cli.analyze) {
  cli.env = 'prod';
}

gulp.task('clean', gulp.parallel(cleanNodeScripts, cleanViewerScripts));
gulp.task('build', gulp.series('clean', compileNodeScripts, compileViewerScripts));
gulp.task('watch', gulp.series('build', watch));
gulp.task('default', gulp.task('watch'));

class TaskError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TaskError';
    // Internal Gulp flag that says "don't display error stack trace"
    this.showStack = false;
  }
}

function watch() {
  gulp
    .watch(NODE_SRC.concat(VIEWER_SRC), gulp.series(cleanNodeScripts, compileNodeScripts, compileViewerScripts))
    // TODO: replace with `emitErrors: false` option after https://github.com/gulpjs/glob-watcher/pull/34 will be merged
    .on('error', () => {});
}

function cleanViewerScripts() {
  const del = require('del');
  return del('public');
}

function cleanNodeScripts() {
  const del = require('del');
  return del(NODE_DEST);
}

function compileNodeScripts() {
  const babel = require('gulp-babel');

  return gulp
    .src(NODE_SRC)
    .pipe(babel())
    .pipe(gulp.dest(NODE_DEST));
}

function compileViewerScripts() {
  const webpack = require('webpack');
  const config = require('./webpack.config')({
    env: cli.env,
    analyze: cli.analyze
  });

  return new Promise((resolve, reject) => {
    webpack(config, (err, stats) => {
      if (cli.env === 'dev') {
        if (err) {
          console.error(err);
        } else {
          console.log(stats.toString({colors: true}));
        }
        resolve();
      } else {
        if (err) return reject(err);

        if (stats.hasErrors()) {
          reject(
            new TaskError('Webpack compilation error')
          );
        }

        console.log(stats.toString({colors: true}));
        resolve();
      }
    });
  });
}
