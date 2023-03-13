import { chromium, type Page } from 'playwright'
import { type Browser, expect } from '@playwright/test'
import { Markup, Telegraf } from 'telegraf'
import dotenv from 'dotenv'
import { type InputFile } from 'telegraf/types'
import { message } from 'telegraf/filters'
import cron from 'node-cron'

dotenv.config()
const url = 'https://icp.administracionelectronica.gob.es/icpplustiem/citar?p=28&locale=es&appkey=null'
const { NIE, NAME, COUNTRY_CODE } = process.env
const NO_APPOINTMENT = 'no hay citas disponibles'
const delay = async (ms: number) => await new Promise(resolve => setTimeout(resolve, ms))
const sendScreenshot = async (bot: Telegraf, page: Page, message?: string) => {
  const screenshot = await page.screenshot()
  const inputFile: InputFile = {
    source: screenshot,
    filename: 'screenshot.png'
  }
  await bot.telegram.sendDocument(CHAT_ID, inputFile, { caption: message })
}
const sendText = async (bot: Telegraf, text: string) => {
  await bot.telegram.sendMessage(CHAT_ID, text)
}

const CHAT_ID = process.env.CHAT_ID ?? ''
const bot = new Telegraf(process?.env.BOT_TOKEN ?? '')
const MENU = {
  SCRAPE_NOW: 'Scrape now',
  START_TIMER: 'Start timer',
  STOP_TIMER: 'Stop timer'
} as const
bot.start(async (ctx) => {
  await ctx.reply(`chat id: ${ctx.chat.id}`, Markup
    .keyboard([
      [MENU.SCRAPE_NOW],
      [MENU.START_TIMER],
      [MENU.STOP_TIMER]
    ])
    .oneTime()
    .resize()
  )
})
const step1 = async (page: Page) => {
  await page.goto(url)
  await sendScreenshot(bot, page, 'step 1')
}
const step2 = async (page: Page) => {
  const select = page.getByLabel('TRÁMITES CUERPO NACIONAL DE POLICÍA')
  try {
    await expect(select).toBeEnabled()
    await select.selectOption(['4010'])

    await delay(2000)

    await page.click('#btnAceptar')
    await sendScreenshot(bot, page, 'step 2')
  } catch (e) {
    await sendScreenshot(bot, page, 'select is not enabled')
    await sendText(bot, 'select is not enabled, ' + JSON.stringify(e))
    await page.close()
  }
}

const step3 = async (page: Page) => {
  await page.click('#btnEntrar')
  await sendScreenshot(bot, page, 'step 3')
}
const step4 = async (page: Page) => {
  await page.locator('#txtIdCitado').fill(NIE ?? '')
  await page.locator('#txtDesCitado').fill(NAME ?? '')
  await page.locator('#txtPaisNac').selectOption([COUNTRY_CODE ?? ''])
  await delay(2000)
  await sendScreenshot(bot, page, 'filled form')
  await page.click('#btnEnviar')
  await sendScreenshot(bot, page, 'step 4')
}

const step5 = async (page: Page, browser: Browser) => {
  try {
    if (await page.getByText(NO_APPOINTMENT).count() > 0) {
      await sendScreenshot(bot, page, 'step 5 failed')
      await sendText(bot, 'No hay citas disponibles')
      await page.close()
      await browser.close()
      return
    }
    await delay(2000)
    const button = await page.waitForSelector('#btnEnviar', { timeout: 1000 })
    await button.click()
    await sendScreenshot(bot, page, 'step 5')
  } catch (e) {
    await sendScreenshot(bot, page, 'step 5')
    await sendText(bot, 'No hay citas disponibles')
  }
}
const step6 = async (page: Page) => {
  await delay(2000)
  await page.click('#btnEnviar')
  await sendScreenshot(bot, page, 'step 6')
}

const scrape = async () => {
  const browser = await chromium.launch()
  try {
    const page = await browser.newPage()
    await step1(page)
    await step2(page)
    await step3(page)
    await step4(page)
    await step5(page, browser)
    await step6(page)
    await browser.close()
  } catch (e) {
    await sendText(bot, JSON.stringify(e))
    await browser?.close?.()
  }
}
const cronTask = cron.schedule('*/1 * * * *', async () => {
  await scrape()
})
console.log('valid: ', cron.validate('*/1 * * * *'))
bot.on(message('text'), async (ctx) => {
  const text = ctx.message?.text
  if (ctx.message.from.id !== Number(process.env.MY_TELEGRAM_ID)) return

  if (text === MENU.SCRAPE_NOW) {
    await scrape()
  }
  if (text === MENU.START_TIMER) {
    await cronTask.start()
    await sendText(bot, 'Timer started')
  }
  if (text === MENU.STOP_TIMER) {
    await cronTask.stop()
    await sendText(bot, 'Timer stopped')
  }
})

void bot.launch()

process.once('SIGINT', () => {
  bot.stop('SIGINT')
})
process.once('SIGTERM', () => {
  bot.stop('SIGTERM')
})
