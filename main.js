const TITLE_LINK_SELECTOR = "a[href*='asin_title']";
const ORDER_CARD_SELECTOR = "[class*=order-card]";
const ORDER_TOTAL_SELECTOR = "[class*=order-total] .value";
const ORDER_DATE_SELECTOR = ".order-info .a-column.a-span3 .value";
const INVOICE_URL_SELECTOR = "[class*='order-level-connections'] a:last-child";
const NEXT_PAGE_SELECTOR = ".a-pagination .a-last a";

// Parse the details from each order HTML element on the current page
function currentPageOrders() {
  const currentOrderEls = [...document.querySelectorAll(ORDER_CARD_SELECTOR)];
  return currentOrderEls.map((el) => {
    let order = {
      title: "",
      productLink: "",
      total: null,
      dateOrdered: null,
      invoiceUrl: null,
    };
    try {
      const titleEls = el.querySelectorAll(TITLE_LINK_SELECTOR);
      if (titleEls.length > 1) {
        order.title = [...titleEls]
          .map((titleEl) => titleEl.innerText)
          .join(" | ");
        order.productLink = [...titleEls]
          .map((titleEl) => titleEl.href)
          .join(" | ");
      } else {
        order.title = titleEls[0].innerText;
        order.productLink = titleEls[0].href;
      }
      order.total = el.querySelector(ORDER_TOTAL_SELECTOR).innerText;
      order.dateOrdered = el.querySelector(ORDER_DATE_SELECTOR).innerText;
      order.invoiceUrl = el.querySelector(INVOICE_URL_SELECTOR).href;
    } catch (error) {
      handleParseError(error, el);
    }
    return order;
  });
}

function handleParseError(error, el) {
  console.warn("Error while parsing element: ");
  console.warn(el);
  console.warn(
    "Persisting details to localStorage as amazonDownloaderFailedToParseList"
  );

  const amazonDownloaderFailedToParseList = localStorage.getItem(
    "amazonDownloaderFailedToParseList"
  );
  if (!amazonDownloaderFailedToParseList) {
    localStorage.setItem(
      "amazonDownloaderFailedToParseList",
      JSON.stringify([el.innerText])
    );
  } else {
    localStorage.setItem(
      "amazonDownloaderFailedToParseList",
      JSON.stringify(
        JSON.parse(amazonDownloaderFailedToParseList).concat([el.innerText])
      )
    );
  }
}

function convertToCSV(data) {
  if (data.length === 0) return "";
  const header = Object.keys(data[0]).join(",");
  const rows = data.map((obj) => {
    return Object.values(obj)
      .map((val) => {
        if (
          typeof val === "string" &&
          (val.includes(",") || val.includes('"'))
        ) {
          return `"${val.replace(/"/g, '""')}"`;
        }
        return val;
      })
      .join(",");
  });
  return [header, ...rows].join("\n");
}

// Save the CSV lines to local storage for each page it successfully parses
function saveToLocalStorage(csvData) {
  const existingData = localStorage.getItem("amazonDownloaderCSV") || "";
  if (!existingData) {
    localStorage.setItem("amazonDownloaderCSV", csvData);
  } else {
    const existingRows = existingData.split("\n");
    const newRows = csvData.split("\n").slice(1);
    const combinedData = [...existingRows, ...newRows].join("\n");
    localStorage.setItem("amazonDownloaderCSV", combinedData);
  }
}

// Progress to the next page by targeting a specific selector and assuming the last page if the selector is not present
function goToNextPage() {
  const nextPageLink = document.querySelector(NEXT_PAGE_SELECTOR);
  if (nextPageLink) {
    nextPageLink.click();
  } else {
    return false;
  }
  return true;
}

// Prompt an alert dialog to ask if the user would like to download the orders once all pages have been gone through, and execute the download if the user says yes
function downloadCSV(data) {
  const blob = new Blob([data], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "orders.csv";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, 0);
}

// Main function to start the process
function start() {
  setTimeout(() => {
    let orders = currentPageOrders();
    let csvData = convertToCSV(orders);
    saveToLocalStorage(csvData);
    if (!goToNextPage()) {
      let data = localStorage.getItem("amazonDownloaderCSV");
      if (confirm("Would you like to download the orders?")) {
        downloadCSV(data);
        clearLocalStorage();
      }
    }
  }, 1200);
}

if (localStorage.getItem("amazonDownloaderScraping") == "true") start();

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (message.action === "browserActionClicked") {
    console.log("Starting to download amazon orders...");
    clearLocalStorage();
    start();
    localStorage.setItem("amazonDownloaderScraping", true);
  }
});

function clearLocalStorage() {
  localStorage.removeItem("amazonDownloaderScraping");
  localStorage.removeItem("amazonDownloaderCSV");
  localStorage.removeItem("amazonDownloaderFailedToParseList");
}
