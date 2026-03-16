const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const ADMIN_SECRET = process.env.ADMIN_UPLOAD_SECRET;
const ADMIN_URL = process.env.ADMIN_URL;
const DOWNLOAD_DIR = process.env.DOWNLOAD_DIR ?? "/tmp";

async function downloadPermits() {
  console.log("Starting permit scraper...");

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  try {
    console.log("Navigating to Accela...");
    await page.goto(
      "https://aca-prod.accela.com/DALLASTX/Cap/CapHome.aspx?module=Building&TabName=Building",
      { waitUntil: "networkidle" }
    );

    console.log("Selecting record type...");
    await page.selectOption(
      "#ctl00_PlaceHolderMain_generalSearchForm_ddlGSPermitType",
      "Building/Residential/Roofing/NA"
    );
    await page.waitForLoadState("networkidle");

    const startDate = `01/01/${new Date().getFullYear()}`;
    console.log(`Setting start date to ${startDate}...`);
    await page.evaluate(() => {
      const input = document.getElementById("ctl00_PlaceHolderMain_generalSearchForm_txtGSStartDate");
      input.value = "01/01/2026";
    });

    console.log("Clicking Search...");
    await page.click("#ctl00_PlaceHolderMain_btnNewSearch");

    console.log("Waiting for results...");
    await page.waitForSelector("table.ACA_GridView", { timeout: 5000 });
    console.log("Results loaded.");

    console.log("Downloading CSV...");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.click(
        "#ctl00_PlaceHolderMain_dgvPermitList_gdvPermitList_gdvPermitListtop4btnExport"
      ),
    ]);

    const filePath = path.join(DOWNLOAD_DIR, "permits.csv");
    await download.saveAs(filePath);
    console.log(`CSV saved to ${filePath}`);

    console.log("Uploading to admin route...");
    const fileBuffer = fs.readFileSync(filePath);
    const formData = new FormData();
    formData.append("file", new Blob([fileBuffer], { type: "text/csv" }), "permits.csv");
    formData.append("secret", ADMIN_SECRET);

    const res = await fetch(ADMIN_URL, {
      method: "POST",
      body: formData,
    });

    const responseText = await res.text();

    if (!res.ok) {
      throw new Error(`Import failed: ${res.status} ${responseText}`);
    }

    console.log("Import successful:", responseText);

  } catch (err) {
    console.error("Scraper error:", err);
    process.exit(1);
  } finally {
    await browser.close();
    console.log("Browser closed. Done.");
  }
}

downloadPermits();