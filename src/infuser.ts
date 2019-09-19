import { SFCDescriptor, SFCBlock } from 'vue-template-compiler'
import { Locale, MetaLocaleMessage, SFCI18nBlock, SFCFileInfo } from '../types'

import { escape, reflectSFCDescriptor, parseContent, stringfyContent } from './utils'
import prettier from 'prettier'

import { debug as Debug } from 'debug'
const debug = Debug('vue-i18n-locale-message:infuser')

export default function infuse (basePath: string, sources: SFCFileInfo[], meta: MetaLocaleMessage): SFCFileInfo[] {
  const descriptors = reflectSFCDescriptor(basePath, sources)

  return descriptors.map(descriptor => {
    return {
      content: generate(meta, descriptor),
      path: descriptor.contentPath
    } as SFCFileInfo
  })
}

function generate (meta: MetaLocaleMessage, descriptor: SFCDescriptor): string {
  const i18nBlocks = meta.components[descriptor.contentPath]
  debug('target i18n blocks\n', i18nBlocks)

  const blocks: SFCBlock[] = getBlocks(descriptor)
  blocks.forEach(b => debug(`block: type=${b.type}, start=${b.start}, end=${b.end}`))

  const { raw } = descriptor
  const content = buildContent(i18nBlocks, raw, blocks)
  debug(`build content:\n${content}`)
  debug(`content size: raw=${raw.length}, content=${content.length}`)

  return format(content, 'vue')
}

function getBlocks (descriptor: SFCDescriptor): SFCBlock[] {
  const { template, script, styles, customBlocks } = descriptor
  const blocks: SFCBlock[] = [...styles, ...customBlocks]
  template && blocks.push(template as SFCBlock)
  script && blocks.push(script as SFCBlock)
  blocks.sort((a, b) => { return (a.start as number) - (b.start as number) })
  return blocks
}

function buildContent (i18nBlocks: SFCI18nBlock[], raw: string, blocks: SFCBlock[]): string {
  let offset = 0
  let i18nBlockCounter = 0
  let contents: string[] = []

  contents = blocks.reduce((contents, block) => {
    if (block.type === 'i18n') {
      let lang = block.attrs.lang
      lang = (!lang || typeof lang !== 'string') ? 'json' : lang
      const locale: Locale | undefined = block.attrs.locale
      const i18nBlock = i18nBlocks[i18nBlockCounter]
      debug(`meta.lang = ${i18nBlock.lang}, block.lang = ${lang}, meta.locale = ${i18nBlock.locale}, block.locale = ${locale}`)

      let messages: any = null
      if (lang === i18nBlock.lang && locale === i18nBlock.locale) {
        if (locale) {
          messages = i18nBlock.messages[locale]
        } else {
          messages = i18nBlock.messages
        }
      } else {
        debug(`unmatch meta block and sfc block`)
        messages = parseContent(block.content, lang)
      }

      contents = contents.concat(raw.slice(offset, block.start))
      const serialized = `\n${format(stringfyContent(messages, lang), lang)}`
      contents = contents.concat(serialized)
      offset = block.end as number
      i18nBlockCounter++
    } else {
      contents = contents.concat(raw.slice(offset, block.end))
      offset = block.end as number
    }
    return contents
  }, contents)
  contents = contents.concat(raw.slice(offset, raw.length))

  if (i18nBlocks.length > i18nBlockCounter) {
    i18nBlocks.slice(i18nBlockCounter).reduce((contents, i18nBlock) => {
      contents.push(buildI18nTag(i18nBlock))
      return contents
    }, contents)
  }

  return contents.join('')
}

function buildI18nTag (i18nBlock: SFCI18nBlock): string {
  const { locale, lang, messages } = i18nBlock
  let tag = '<i18n'
  if (locale) {
    tag += ` locale="${escape(locale)}"`
  }
  if (lang !== 'json') {
    tag += ` lang="${escape(lang)}"`
  }
  tag += '>'

  return `\n
${tag}
${format(stringfyContent(locale ? messages[locale] : messages, lang), lang)}</i18n>`
}

function format (source: string, lang: string): string {
  debug(`format: lang=${lang}, source=${source}`)

  switch (lang) {
    case 'vue':
      return source
    case 'yaml':
    case 'yml':
      return prettier.format(source, { parser: 'yaml', tabWidth: 2 })
    case 'json5':
      return prettier.format(source, { parser: 'json5', tabWidth: 2 })
    case 'json':
    default:
      return prettier.format(source, { parser: 'json-stringify', tabWidth: 2 })
  }
}
