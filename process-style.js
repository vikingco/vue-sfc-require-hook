const path = require('path');
const fs = require('fs');
const cssExtract = require('extract-from-css');
const compileStyle = require('@vue/component-compiler-utils').compileStyle;
const applyModuleNameMapper = require('./module-name-mapper-helper');
const logResultErrors = require('./utils').logResultErrors;
const loadSrc = require('./utils').loadSrc;

function getPreprocessOptions(lang, filePath, jestConfig) {
    if (lang === 'scss' || lang === 'sass') {
        return {
            importer: (url, prev, done) => {
                let file = url;
                file = file.replace(/^~/, '');
                file = applyModuleNameMapper(
                    file,
                    url.startsWith('~') ? prev : filePath,
                    jestConfig,
                    lang,
                );
                file = file.replace(/(\.scss)?$/, '.scss');
                return { file };
            },
        };
    }
    if (lang === 'styl' || lang === 'stylus') {
        return {
            paths: [path.dirname(filePath), process.cwd()],
        };
    }
}

module.exports = function processStyle(stylePart, filePath, config = {}) {
    if (stylePart.src && !stylePart.content.trim()) {
        const cssFilePath = applyModuleNameMapper(
            stylePart.src,
            filePath,
            config,
            stylePart.lang,
        );
        stylePart.content = loadSrc(cssFilePath, filePath);
        filePath = cssFilePath;
    }

    if (!stylePart.content) {
        return '{}';
    }

    console.log(`Processing style part: ${filePath} with prelude ${config.stylePrelude}`);

    let content = (config.stylePrelude ?? '') + stylePart.content;

    const preprocessOptions = getPreprocessOptions(
        stylePart.lang,
        filePath,
        config,
    );
    const result = compileStyle({
        source: content,
        filename: './vuefile.css',
        filePath,
        preprocessLang: stylePart.lang,
        preprocessOptions,
        scoped: false,
    });
    logResultErrors(result);

    return postProcess(result.code);

    function postProcess(code) {
        code = inlineStaticImports(code);
        return code;
    }

    function inlineStaticImports(code) {
        const regex = /@import\s+["']([^"']+)["']\s*;/g;
        return code.replace(regex, (match, file) => {
            file = file.replace(/^~/, '');
            const filePath = applyModuleNameMapper(file, stylePart.src, config, stylePart.lang);
            const fileContent = fs.readFileSync(filePath, 'utf-8');
            return fileContent;
        });
    }
};
