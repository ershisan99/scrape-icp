import { chromium, type Page } from 'playwright'
import { expect } from '@playwright/test'
import { Markup, Telegraf, Telegram } from 'telegraf'
import dotenv from 'dotenv'
import { type InputFile } from 'telegraf/types'
dotenv.config()
const url = 'https://icp.administracionelectronica.gob.es/icpplustiem/citar?p=28&locale=es&appkey=null'
const nie = 'y4149706z'
const name = 'ANDRII ZADOROZHNYI'
const countryCode = '152'
const delay = async (ms: number) => await new Promise(resolve => setTimeout(resolve, ms))

const CHAT_ID = process.env.CHAT_ID ?? ''
const bot = new Telegraf(process?.env.BOT_TOKEN ?? '')
console.log(process.env.BOT_TOKEN)

bot.start(async (ctx) => {
  console.log(ctx)
  console.log(ctx.chat.id)
  await ctx.reply('this is text', Markup
    .keyboard([
      ['Scrape', 'button 2'] // Row1 with 2 buttons
    ])
    .oneTime()
    .resize()
  )
})
const step1 = async (page: Page) => {
  await page.goto(url)
  await page.screenshot({ path: 'i.png' })
}
const step2 = async (page: Page) => {
  const select = page.getByLabel('TRÁMITES CUERPO NACIONAL DE POLICÍA')
  try {
    await expect(select).toBeEnabled()
    await select.selectOption(['4010'])
    await page.click('#btnAceptar')
    await page.click('#btnEntrar')
  } catch (e) {
    throw new Error('select is not enabled')
  }
}
const step3 = async (page: Page) => {
  await page.locator('#txtIdCitado').fill(nie)
  await page.locator('#txtDesCitado').fill(name)
  await page.locator('#txtPaisNac').selectOption([countryCode])
  await delay(2000)
  await page.screenshot({ path: '1.png' })
  await delay(2000)
  await page.click('#btnEnviar')

  await page.screenshot({ path: '2.png' })
}
const step4 = async (page: Page) => {
  try {
    const button = await page.waitForSelector('#btnEnviar', { timeout: 1000 })
    await button.click()
  } catch (e) {
    const errorScreenshot = await page.screenshot({ path: 'error.png' })
    await bot.telegram.sendMessage(CHAT_ID, 'No hay citas disponibles')
    const inputFile: InputFile = {
      source: errorScreenshot,
      filename: 'error.png'
    }
    await bot.telegram.sendPhoto(CHAT_ID, inputFile)
    throw new Error('No hay citas disponibles')
  }
  await page.click('#btnEnviar')
  await page.screenshot({ path: '3.png' })
}
const scrape = async () => {
  const browser = await chromium.launch({ headless: false })

  const page = await browser.newPage()
  await step1(page)
  await step2(page)
  await step3(page)
  await step4(page)
  await browser.close()
}
bot.on('message', async (ctx) => {
  // @ts-expect-error
  if (ctx.message?.text === 'Scrape') {
    await scrape()
  }
})
void bot.launch()

process.once('SIGINT', () => { bot.stop('SIGINT') })
process.once('SIGTERM', () => { bot.stop('SIGTERM') })
