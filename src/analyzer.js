const fs = require('fs');
const path = require('path');

const _ = require('lodash');
const gzipSize = require('gzip-size');

const Logger = require('./Logger');
const Folder = require('./tree/Folder').default;
const {parseBundle} = require('./parseUtils');
const {createAssetsFilter} = require('./utils');

const FILENAME_QUERY_REGEXP = /\?.*$/u;
const FILENAME_EXTENSIONS = /\.(js|mjs|gz|br)$/iu;

module.exports = {
  getViewerData,
  readStatsFromFile
};

function getViewerData(bundleStats, bundleDir, opts) {
  const {
    logger = new Logger(),
    excludeAssets = null
  } = opts || {};

  const isAssetIncluded = createAssetsFilter(excludeAssets);

  // Sometimes all the information is located in `children` array (e.g. problem in #10)
  if (_.isEmpty(bundleStats.assets) && !_.isEmpty(bundleStats.children)) {
    const {children} = bundleStats;
    bundleStats = bundleStats.children[0];
    // Sometimes if there are additional child chunks produced add them as child assets,
    // leave the 1st one as that is considered the 'root' asset.
    for (let i = 1; i < children.length; i++) {
      bundleStats.children[i].assets.forEach((asset) => {
        asset.isChild = true;
        bundleStats.assets.push(asset);
      });
    }
  } else if (!_.isEmpty(bundleStats.children)) {
    // Sometimes if there are additional child chunks produced add them as child assets
    bundleStats.children.forEach((child) => {
      child.assets.forEach((asset) => {
        asset.isChild = true;
        bundleStats.assets.push(asset);
      });
    });
  }

  // Picking only `*.js or *.mjs or *.gz or *.br` assets from bundle that has non-empty `chunks` array
  bundleStats.assets = _.filter(bundleStats.assets, asset => {
    // Removing query part from filename (yes, somebody uses it for some reason and Webpack supports it)
    // See #22
    asset.name = asset.name.replace(FILENAME_QUERY_REGEXP, '');

    return FILENAME_EXTENSIONS.test(asset.name) && !_.isEmpty(asset.chunks) && isAssetIncluded(asset.name);
  });

  // Trying to parse bundle assets and get real module sizes if `bundleDir` is provided
  let bundlesSources = null;
  let parsedModules = null;

  if (bundleDir) {
    bundlesSources = {};
    parsedModules = {};

    for (const statAsset of bundleStats.assets) {
      const assetFile = path.join(bundleDir, statAsset.name);
      let bundleInfo;

      try {
        bundleInfo = parseBundle(assetFile, {logger});
      } catch (err) {
        const msg = (err.code === 'ENOENT') ? 'no such file' : err.message;
        logger.warn(`Error parsing bundle asset "${assetFile}": ${msg}`);
        continue;
      }

      bundlesSources[statAsset.name] = bundleInfo.src;
      _.assign(parsedModules, bundleInfo.modules);
    }

    if (_.isEmpty(bundlesSources)) {
      bundlesSources = null;
      parsedModules = null;
      logger.warn('\nNo bundles were parsed. Analyzer will show only original module sizes from stats file.\n');
    }
  }

  const assets = _.transform(bundleStats.assets, (result, statAsset) => {
    // If asset is a childAsset, then calculate appropriate bundle modules by looking through stats.children
    const assetBundles = statAsset.isChild ? getChildAssetBundles(bundleStats, statAsset.name) : bundleStats;
    const modules = assetBundles ? getBundleModules(assetBundles) : [];
    const asset = result[statAsset.name] = _.pick(statAsset, 'size');

    if (bundlesSources && _.has(bundlesSources, statAsset.name)) {
      asset.parsedSize = Buffer.byteLength(bundlesSources[statAsset.name]);
      asset.gzipSize = gzipSize.sync(bundlesSources[statAsset.name]);
    }

    // Picking modules from current bundle script
    asset.modules = _(modules)
      .filter(statModule => assetHasModule(statAsset, statModule))
      .each(statModule => {
        if (parsedModules) {
          statModule.parsedSrc = parsedModules[statModule.id];
        }
      });

    asset.tree = createModulesTree(asset.modules);
  }, {});

  return _.transform(assets, (result, asset, filename) => {
    result.push({
      label: filename,
      isAsset: true,
      // Not using `asset.size` here provided by Webpack because it can be very confusing when `UglifyJsPlugin` is used.
      // In this case all module sizes from stats file will represent unminified module sizes, but `asset.size` will
      // be the size of minified bundle.
      // Using `asset.size` only if current asset doesn't contain any modules (resulting size equals 0)
      statSize: asset.tree.size || asset.size,
      parsedSize: asset.parsedSize,
      gzipSize: asset.gzipSize,
      groups: _.invokeMap(asset.tree.children, 'toChartData')
    });
  }, []);
}

function readStatsFromFile(filename) {
  return JSON.parse(
    fs.readFileSync(filename, 'utf8')
  );
}

function getChildAssetBundles(bundleStats, assetName) {
  return _.find(bundleStats.children, (c) =>
    _(c.assetsByChunkName)
      .values()
      .flatten()
      .includes(assetName)
  );
}

function getBundleModules(bundleStats) {
  return _(bundleStats.chunks)
    .map('modules')
    .concat(bundleStats.modules)
    .compact()
    .flatten()
    .uniqBy('id')
    .value();
}

function assetHasModule(statAsset, statModule) {
  // Checking if this module is the part of asset chunks
  return _.some(statModule.chunks, moduleChunk =>
    _.includes(statAsset.chunks, moduleChunk)
  );
}

function createModulesTree(modules) {
  const root = new Folder('.');

  _.each(modules, module => root.addModule(module));
  root.mergeNestedFolders();

  return root;
}
