const fs = require('fs');
const del = require('del');

let nightmare;

describe('Webpack config', function () {
  // `Nightmare` doesn't support Node less than v4 so we have to skip these tests
  const shouldSkip = process.versions.node.startsWith('0.');
  let clock;

  this.timeout(3000);

  before(async function () {
    if (shouldSkip) return this.skip();

    const Nightmare = require('nightmare');
    nightmare = Nightmare();
    del.sync(`${__dirname}/output`);
    clock = sinon.useFakeTimers();
  });

  beforeEach(async function () {
    this.timeout(10000);
    await nightmare.goto('about:blank');
  });

  afterEach(function () {
    del.sync(`${__dirname}/output`);
  });

  after(function () {
    if (shouldSkip) return;
    clock.restore();
  });

  it('with head slash in bundle filename should be supported', async function () {
    const config = makeWebpackConfig();

    config.output.filename = '/bundle.js';

    await webpackCompile(config);
    clock.tick(1);

    await expectValidReport({
      bundleLabel: '/bundle.js'
    });
  });

  it('with query in bundle filename should be supported', async function () {
    const config = makeWebpackConfig();

    config.output.filename = 'bundle.js?what=is-this-for';

    await webpackCompile(config);
    clock.tick(1);

    await expectValidReport();
  });
});

async function expectValidReport(opts) {
  const {
    bundleFilename = 'bundle.js',
    reportFilename = 'report.html',
    bundleLabel = 'bundle.js'
  } = opts || {};

  expect(fs.existsSync(`${__dirname}/output/${bundleFilename}`)).to.be.true;
  expect(fs.existsSync(`${__dirname}/output/${reportFilename}`)).to.be.true;
  const chartData = await nightmare
    .goto(`file://${__dirname}/output/${reportFilename}`)
    .evaluate(() => window.chartData);
  expect(chartData[0]).to.containSubset({
    label: bundleLabel,
    statSize: 141,
    parsedSize: 2776,
    gzipSize: 796
  });
}
