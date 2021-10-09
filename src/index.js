import { promises as fs } from 'fs';
import path from 'path';
import axios from 'axios';
import * as cheerio from 'cheerio';
import urlToFilename from './utils.js';

const makeFileStruct = (url, outputDir) => {
  const fullOutputDirPath = path.resolve(process.cwd(), outputDir);
  const mainFilepath = path.join(fullOutputDirPath, urlToFilename(url));
  const assetsDir = urlToFilename(url, '_files');
  const assetsPath = path.join(fullOutputDirPath, assetsDir);

  return {
    mainFilepath, assetsPath, assetsDir,
  };
};

const assetsAttrsMap = {
  img: 'src',
  link: 'href',
  script: 'src',
};

const parseHtml = (html, assetsDir, origin) => {
  const $ = cheerio.load(html);
  const assets = [];
  Object.entries(assetsAttrsMap).forEach(([tag, attrType]) => {
    $(tag).each((_, elem) => {
      const attr = $(elem).attr(attrType);
      const url = new URL(attr, origin);
      if (url.origin !== origin) {
        return;
      }
      const filename = urlToFilename(url);
      const filepath = `${assetsDir}/${filename}`;
      assets.push({ filename, url });
      $(elem).attr(attrType, filepath);
    });
  });

  return { parsedHtml: $.html(), assets };
};

const downloadAsset = (asset, assetsPath) => axios({
  method: 'get',
  url: asset.url.toString(),
  responseType: 'arraybuffer',
})
  .then((response) => fs.writeFile(path.join(assetsPath, asset.filename), response.data));

export default async (url, outputDir = process.cwd()) => {
  const urlObj = new URL(url);
  const { origin } = urlObj;
  const { mainFilepath, assetsPath, assetsDir } = makeFileStruct(urlObj, outputDir);

  try {
    await fs.access(assetsPath);
  } catch (e) {
    await fs.mkdir(assetsPath);
  }

  const { data } = await axios.get(url);
  const {
    parsedHtml, assets,
  } = parseHtml(data, assetsDir, origin);

  const promises = assets.map((asset) => downloadAsset(asset, assetsPath));
  await Promise.all(promises);
  await fs.writeFile(mainFilepath, parsedHtml);

  return Promise.resolve({ filepath: path.join(outputDir, urlToFilename(urlObj)) });
};
