const TITLE_LINK_SELECTOR_1 = "a[href*='asin_title']";
const TITLE_LINK_SELECTOR_2 = "a[href*='b_product_details']";
const ORDER_CARD_SELECTOR = "[class*=order-card]";
const ORDER_TOTAL_SELECTOR_1 = "[class*=order-total] .value";
const ORDER_TOTAL_SELECTOR_2 = "[class*=order-total]";
const ORDER_DATE_SELECTOR_1 = ".order-info .a-column.a-span3 .value";
const ORDER_DATE_SELECTOR_2 = ".a-row > .a-size-base.a-color-secondary";
const INVOICE_URL_SELECTOR = "a[href*='b_invoice']";
const NEXT_PAGE_SELECTOR = ".a-pagination .a-last a";

function currentPageOrders() {
  const currentOrderEls = [...document.querySelectorAll(ORDER_CARD_SELECTOR)];
  return currentOrderEls.map((el) => {
    return new Promise((resolve) => {
      let order = {
        title: "",
        productLink: "",
        total: null,
        dateOrdered: null,
        invoiceUrl: null,
      };
      try {
        let titleEls = el.querySelectorAll(TITLE_LINK_SELECTOR_1);
        if (titleEls.length == 0) {
          titleEls = [...el.querySelectorAll(TITLE_LINK_SELECTOR_2)].filter(
            (el) => el.children[0].nodeName != "IMG"
          );
        }

        if (titleEls.length > 1) {
          const titleElLinks = [...titleEls].map((titleEl) => titleEl.href);
          order.title = [...titleEls]
            .map((titleEl) => titleEl.innerText)
            .join(" | ");
          order.productLink = titleElLinks.join(" | ");
          order.productId = titleElLinks
            .map(extractProductIdFromLink)
            .join(" | ");
        } else {
          order.title = titleEls[0].innerText;
          order.productLink = titleEls[0].href;
          order.productId = extractProductIdFromLink(order.productLink);
        }
        const orderTotal1 = el.querySelector(ORDER_TOTAL_SELECTOR_1);
        if (orderTotal1) {
          order.total = orderTotal1.innerText;
        } else {
          let orderTotal2 = el.querySelector(ORDER_TOTAL_SELECTOR_2);
          order.total = orderTotal2.innerText;
        }
        const dateOrdered1 = el.querySelector(ORDER_DATE_SELECTOR_1);
        if (dateOrdered1) {
          order.dateOrdered = dateOrdered1.innerText;
        } else {
          order.dateOrdered = el.querySelector(
            ORDER_TOTAL_SELECTOR_2
          ).innerText;
        }

        order.invoiceUrl = el.querySelector(INVOICE_URL_SELECTOR).href;

        savePageContentAsHTML(order)
          .then(() => resolve(order)) // Resolve promise with the order
          .catch((error) => {
            handleParseError(error, el);
            resolve(); // Resolve promise without any data
          });
      } catch (error) {
        handleParseError(error, el);
        resolve(); // Resolve promise without any data
      }
    });
  });
}

function savePageContentAsHTML(order) {
  return new Promise(async (resolve, reject) => {
    try {
      const response = await fetch(order.invoiceUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch: ${response.statusText}`);
      }

      const content = await response.text();

      // Create a blob from the content
      const blob = new Blob([content], { type: "text/html" });

      // Create a download link
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `INVOICE-${order.productId}.html`;

      // Append the link to the document and simulate a click
      document.body.appendChild(link);
      link.click();

      // Cleanup
      document.body.removeChild(link);

      resolve(); // Resolve the promise when successful
    } catch (error) {
      console.error("Error fetching and saving content:", error);
      reject(error); // Reject the promise with the error
    }
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
    // Parse the details from each order HTML element on the current page
    Promise.all(currentPageOrders()).then((orders) => {
      orders = orders.filter((o) => o !== undefined || o !== null);

      let csvData = convertToCSV(orders);
      saveToLocalStorage(csvData);
      if (!goToNextPage()) {
        localStorage.removeItem("amazonDownloaderScraping");
        let data = localStorage.getItem("amazonDownloaderCSV");
        if (
          confirm(
            "Succesfully parsed all your orders! Would you like to download them now?"
          )
        ) {
          downloadCSV(data);
        }
      }
    });
  }, 1200);
}

if (localStorage.getItem("amazonDownloaderScraping") == "true") start();

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (message.action === "browserActionClicked") {
    if (confirm("Would you like to start to download the orders?")) {
      console.log("Starting to download amazon orders...");
      clearLocalStorage();
      start();
      localStorage.setItem("amazonDownloaderScraping", true);
    }
  }
});

function clearLocalStorage() {
  localStorage.removeItem("amazonDownloaderScraping");
  localStorage.removeItem("amazonDownloaderCSV");
  localStorage.removeItem("amazonDownloaderFailedToParseList");
}

function extractProductIdFromLink(productLink) {
  // If productLink has | it means there are multiple products purchased in this order. Split it and parse each url
  const regex = /https:\/\/.+\/gp\/product\/(?<productId>.+)\/ref=.*/;
  const match = productLink.match(regex);

  if (match && match.groups) {
    const productId = match.groups.productId;
    return productId;
  } else {
    console.log("No match found.");
  }
}
