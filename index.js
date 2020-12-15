/** Vue SFC extension.  Simple require extension to load Vue SFCs.  Exposes a pirates-compatible hook.
 * Based on vue-jest */

const splitRE = /\r?\n/g;

const babel = require('@babel/core');
const compilerUtils = require('@vue/component-compiler-utils');
const VueTemplateCompiler = require('vue-template-compiler');
const generateSourceMap = require('./generate-source-map');
const _processStyle = require('./process-style');
const processCustomBlocks = require('./process-custom-blocks');
const logResultErrors = require('./utils').logResultErrors;
const stripInlineSourceMap = require('./utils').stripInlineSourceMap;
const loadSrc = require('./utils').loadSrc;
const generateCode = require('./generate-code');

function renderSfc(babelConfig) {

    function processScript(scriptPart, filePath) {
        if (!scriptPart) {
            return null;
        }

        let externalSrc = null;
        if (scriptPart.src) {
            scriptPart.content = loadSrc(scriptPart.src, filePath);
            externalSrc = scriptPart.content;
        }

        const result = babel.transformSync(scriptPart.content, { filename: filePath, ...babelConfig });
        result.code = stripInlineSourceMap(result.code);
        result.externalSrc = externalSrc;
        return result;
    }

    function processTemplate(template, filename) {
        if (!template) {
            return null;
        }

        if (template.src) {
            template.content = loadSrc(template.src, filename);
        }

        const userTemplateCompilerOptions = {};

        try {

            const result = compilerUtils.compileTemplate({
                source: template.content,
                compiler: VueTemplateCompiler,
                filename,
                isFunctional: template.attrs.functional,
                preprocessLang: template.lang,
                ...userTemplateCompilerOptions,
                compilerOptions: {
                    optimize: false,
                    ...userTemplateCompilerOptions.compilerOptions,
                },
                transformAssetUrls: { ...userTemplateCompilerOptions.transformAssetUrls },
                transpileOptions: { ...userTemplateCompilerOptions.transpileOptions },
            });

            logResultErrors(result);

            result.code = babel.transformSync(result.code, { filename, ...babelConfig }).code;

            return result;
        } catch (e) {
            return '/* Failed to compile template */';
        }


    }

    function processStyle(styles, filename, config) {
        if (!styles) {
            return null;
        }

        const filteredStyles = styles
            .filter((style) => style.module)
            .map((style) => ({
                code: _processStyle(style, filename, config),
                moduleName: style.module === true ? '$style' : style.module,
            }));

        return filteredStyles.length ? filteredStyles : null;
    }

    return (src, filename) => {

        const config = {};

        const descriptor = compilerUtils.parse({
            source: src,
            compiler: VueTemplateCompiler,
            filename,
        });

        const templateResult = processTemplate(descriptor.template, filename, config);
        const scriptResult = processScript(descriptor.script, filename, config);
        const stylesResult = processStyle(descriptor.styles, filename, config);
        const customBlocksResult = processCustomBlocks(
            descriptor.customBlocks,
            filename,
            config,
        );

        const isFunctional =
            (descriptor.template &&
                descriptor.template.attrs &&
                descriptor.template.attrs.functional) ||
            (descriptor.script &&
                descriptor.script.content &&
                /functional:\s*true/.test(descriptor.script.content));

        const templateStart = descriptor.template && descriptor.template.start;
        const templateLine = src.slice(0, templateStart)
            .split(splitRE).length;

        const output = generateCode(
            scriptResult,
            templateResult,
            stylesResult,
            customBlocksResult,
            isFunctional,
        );

        const map = generateSourceMap(
            scriptResult,
            src,
            filename,
            output.renderFnStartLine,
            output.renderFnEndLine,
            templateLine,
        ).toJSON();

        return `${output.code}\n//${JSON.stringify(map)}}`;
    };

}
module.exports = { renderSfc };
