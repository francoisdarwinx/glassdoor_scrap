import puppeteer, { Page } from 'puppeteer'
const fs = require('fs')

require('dotenv').config();

const GLASSDOOR_URL = 'https://www.glassdoor.fr'

const getJobs = async (page: Page, group: string) => {
    try {
        const jobsLink = process.env.JOBS_LINK
        
        if (!jobsLink) {
            throw new Error('You need to specify JOBS_LINK environment variable.')
        }
        await page.goto(jobsLink)
        
        const jobsLinks = (await page.evaluate((GLASSDOOR_URL, group) => {
            return [...document.querySelectorAll('.jobsList__JobsListStyles__jobListContainer a[href]')].map(el => {
                    const href = el.getAttribute('href')
        
                    return href ? { group: group, company: '', location: '', link: `${GLASSDOOR_URL}${href}`, title: '', score: '' } : null
            })
        }, GLASSDOOR_URL, group)).filter(job => {
            if (job) {
                return true
            }
            return false
        })
        let uniqueJobs = [...new Map(jobsLinks.map(v => [v!.link, v])).values()]
    
        for (let index = 0; index < uniqueJobs.length; index++) {
            await page.goto(uniqueJobs[index]?.link!)
            uniqueJobs[index]!.title = await (await (await page.$('#JDCol [data-test*=jobTitle]'))!.getProperty('innerText')).jsonValue() as string
            uniqueJobs[index]!.location = await (await (await page.$('#JDCol [data-test*=location]'))!.getProperty('innerText')).jsonValue() as string
            uniqueJobs[index]!.company = (await (await (await page.$('#JDCol [data-test*=employerName]'))!.getProperty('innerText')).jsonValue() as string).split('\n')[0]
            uniqueJobs[index]!.score = (await (await (await page.$('#JDCol [data-test*=detailRating]'))!.getProperty('innerText')).jsonValue()) as string
        }
        return uniqueJobs
    } catch (error) {
        console.error(`${group} getJob() error:`, error)
        return []
    }
}

const getSalariesPage = async (page: Page, group: string, link: string) => {
    try {
        await page.goto(link)
        
        const salariesLinks = (await page.evaluate((GLASSDOOR_URL, group) => {
            return [...document.querySelectorAll('#SalariesRef a[href]')].map(el => {
                    const href = el.getAttribute('href')
        
                    return href ? { group: group, link: `${GLASSDOOR_URL}${href}`, title: '', salary: '' } : null
            })
        }, GLASSDOOR_URL, group)).filter(salary => {
            if (salary) {
                return true
            }
            return false
        })
        let uniqueSalaries = [...new Map(salariesLinks.map(v => [v.link, v])).values()]
        
        for (let index = 0; index < uniqueSalaries.length; index++) {
            await page.goto(uniqueSalaries[index]?.link!)
            uniqueSalaries[index]!.title = (await (await (await page.$('.ReactEISalariesDetailPage h1'))!.getProperty('innerText')).jsonValue() as string).replace('Salaires d\'un ', '').replace(` chez ${group}`, '')
            uniqueSalaries[index]!.salary = await (await (await page.$('.ReactEISalariesDetailPage h2'))!.getProperty('innerText')).jsonValue() as string
        }
        return uniqueSalaries
    } catch (error) {
        console.log(link, error)
        return []
    }
}

const getSalaries = async (existing: any, page: Page, group: string) => {
    try {
        const salariesLink = process.env.SALARIES_LINK
        
        if (!salariesLink) {
            throw new Error('You need to specify SALARIES_LINK environment variable.')
        }
        let allSalaries = []
    
        for (let index = 0; index < 300; index++) {
            const nlink = `${index ? salariesLink.split('.htm')[0] + '_P' + (index + 1).toString() + '.htm' : salariesLink}`

            if (existing.indexOf((el: any) => el.link === nlink) < 0) {
                const salaries = await getSalariesPage(page, group, nlink)
    
                if (!salaries.length) {
                    break
                } else {
                    allSalaries.push(...salaries)
                }
            }
        }
        return allSalaries
    } catch (error) {
        return []
    }
}

const getExisting = (outputDir: string, group: string, name: string) => {
    let data = []
    
    try {
        const raw = fs.readFileSync(`${outputDir}${group}/${name}`)
        const existingContent = JSON.parse(raw)
        
        data.push(...existingContent)
    } catch (error) {
    }
    return data
}

const addToExisting = (existing: any, data: any, outputDir: string, group: string, name: string) => {
    let ndata = []

    if (existing.length) {
        ndata.push(...existing)
    }
    if (data.length) {
        ndata.push(...data)
    }
    fs.writeFileSync(`${outputDir}${group}/${name}`, JSON.stringify(ndata, null, 4))
}

(async () => {
    const browser = await puppeteer.launch()
    const page = await browser.newPage()

    const group = process.env.GROUP
    if (!group) {
        throw new Error('You need to specify GROUP environment variable.')
    }
    const outputDir = process.env.OUTPUT_DIR || 'output/'
    fs.mkdirSync(outputDir, { recursive: true })
    fs.mkdirSync(`${outputDir}${group}`, { recursive: true })
    
    const jobsFileName = 'jobs.json'
    const existingJobs = getExisting(outputDir, group, jobsFileName)
    const jobs = await getJobs(page, group)
    addToExisting(existingJobs, jobs, outputDir, group, jobsFileName)

    const salariesFileName = 'salaries.json'
    const existingSalaries = getExisting(outputDir, group, salariesFileName)
    const salaries = await getSalaries(existingSalaries, page, group)
    addToExisting(existingSalaries, salaries, outputDir, group, salariesFileName)

    await browser.close()
})()