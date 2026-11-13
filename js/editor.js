
/* ============================================
   ARAM EVENTS - WEBSITE EDITOR
============================================ */

const iframe = document.getElementById("websitePreview");

const sectionSelect = document.getElementById("sectionSelect");
const textElementSelect = document.getElementById("textElementSelect");
const textContentInput = document.getElementById("textContentInput");

const backgroundInput = document.getElementById("backgroundInput");
const textColourInput = document.getElementById("textColourInput");

const imageSelect = document.getElementById("imageSelect");
const imageInput = document.getElementById("imageInput");
const visibilityInput = document.getElementById("visibilityInput");

const statusMessage = document.getElementById("statusMessage");

let templatePath = "";

let sections = [];
let textElements = [];
let images = [];

let selectedSection = null;
let selectedTextElement = null;
let selectedImageElement = null;
let selectedImageData = null;

let previewClickHandler = null;

const params = new URLSearchParams(window.location.search);
templatePath = params.get("template") || "";


/* ============================================
   STATUS
============================================ */

function showStatus(message) {
    statusMessage.textContent = message;
}


/* ============================================
   DOCUMENT
============================================ */

function getDocument() {
    return iframe.contentDocument;
}


/* ============================================
   STORAGE KEYS
============================================ */

function storageKey() {
    return "aram-editor-" + templatePath;
}

function originalKey() {
    return "aram-original-" + templatePath;
}


/* ============================================
   VALIDATE TEMPLATE
============================================ */

function validTemplatePath(path) {
    return path.startsWith("./templates/") &&
        path.endsWith(".html") &&
        !path.includes("..") &&
        !path.includes("\\");
}


/* ============================================
   ADD BASE URL
============================================ */

function addBaseTag(html, baseURL) {
    const baseTag = `<base href="${baseURL}">`;

    if (/<head[^>]*>/i.test(html)) {
        return html.replace(
            /<head([^>]*)>/i,
            `<head$1>${baseTag}`
        );
    }

    return html;
}


/* ============================================
   LOAD TEMPLATE
============================================ */

function loadTemplate() {

    if (!validTemplatePath(templatePath)) {
        showStatus("Please open this editor using an Edit button.");
        return;
    }

    const savedHTML = localStorage.getItem(storageKey());

    if (savedHTML) {

        const baseURL = new URL(
            templatePath,
            window.location.href
        ).href;

        iframe.srcdoc = addBaseTag(savedHTML, baseURL);

    } else {

        iframe.src = new URL(
            templatePath,
            window.location.href
        ).href;

    }
}


/* ============================================
   TEMPLATE LOAD
============================================ */

iframe.addEventListener("load", function () {

    try {

        const doc = getDocument();

        if (!doc || !doc.body) {
            showStatus("Template could not be loaded.");
            return;
        }

        discoverSections();
        installPreviewSelection();

        showStatus("Template loaded successfully.");

    } catch (error) {

        console.error(error);
        showStatus("Error loading template.");

    }

});


/* ============================================
   DISCOVER SECTIONS
============================================ */

function discoverSections() {

    const doc = getDocument();

    sections = [];

    const header = doc.querySelector("header");

    if (header) {
        sections.push(header);
    }

    const main = doc.querySelector("main");

    if (main) {

        const mainBlocks = Array.from(main.children).filter(element => {
            return element.textContent.trim().length > 0 ||
                element.querySelector("img");
        });

        if (mainBlocks.length > 0) {
            sections.push(...mainBlocks);
        } else {
            sections.push(main);
        }

    } else {

        const pageSections = Array.from(
            doc.querySelectorAll("section, article, footer")
        );

        sections.push(...pageSections.filter(element => {

            return !pageSections.some(other =>
                other !== element && other.contains(element)
            );

        }));

    }

    const footer = doc.querySelector("footer");

    if (footer && !sections.includes(footer)) {
        sections.push(footer);
    }

    sections = [...new Set(sections)];

    sections = sections.filter(element => {
        return element.textContent.trim().length > 0 ||
            element.querySelector("img");
    });

    sectionSelect.innerHTML = "";

    sections.forEach((section, index) => {

        const option = document.createElement("option");

        option.value = index;
        option.textContent = getSectionName(section, index);

        sectionSelect.appendChild(option);

    });

    if (sections.length > 0) {
        selectSection(0, null, false);
    } else {
        showStatus("No editable sections were found.");
    }

    sectionSelect.onchange = function () {
        selectSection(Number(this.value));
    };

}


/* ============================================
   SECTION NAME
============================================ */

function getSectionName(section, index) {

    const heading = section.querySelector("h1,h2,h3,h4,h5,h6");

    if (heading && heading.textContent.trim()) {
        return heading.textContent.trim()
            .replace(/\s+/g, " ")
            .slice(0, 45);
    }

    if (section.tagName.toLowerCase() === "header") {
        return "Header / Navigation";
    }

    if (section.tagName.toLowerCase() === "footer") {
        return "Footer";
    }

    return "Section " + (index + 1);
}


/* ============================================
   SELECT SECTION
   AUTOMATIC PREVIEW SCROLL
============================================ */

function selectSection(index, clickedElement = null, shouldScroll = true) {

    clearHighlights();

    selectedSection = sections[index] || null;

    if (!selectedSection) return;

    sectionSelect.value = String(index);

    const doc = getDocument();

    const styles = doc.defaultView.getComputedStyle(
        selectedSection
    );

    backgroundInput.value = toHex(
        styles.backgroundColor,
        "#ffffff"
    );

    textColourInput.value = toHex(
        styles.color,
        "#222222"
    );

    visibilityInput.checked =
        styles.display !== "none" &&
        styles.visibility !== "hidden";

    discoverTextElements();
    discoverImages();

    selectedSection.style.outline = "2px dashed #15965b";

    if (shouldScroll) {
        selectedSection.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    }

    if (clickedElement) {

        const textIndex = textElements.indexOf(clickedElement);

        if (textIndex !== -1) {
            selectTextElement(textIndex);
        }

    }

    showStatus(
        "Selected: " + getSectionName(selectedSection, index)
    );

}


/* ============================================
   DISCOVER TEXT ELEMENTS
============================================ */

function discoverTextElements() {

    textElements = [];

    if (!selectedSection) return;

    const candidates = Array.from(
        selectedSection.querySelectorAll("*")
    );

    textElements = candidates.filter(element => {

        const tag = element.tagName.toLowerCase();

        if (
            ["script", "style", "noscript", "svg",
             "path", "iframe", "input", "textarea"].includes(tag)
        ) {
            return false;
        }

        return Array.from(element.childNodes).some(node =>
            node.nodeType === Node.TEXT_NODE &&
            node.textContent.trim().length > 0
        );

    });

    textElementSelect.innerHTML =
        '<option value="">Select text, heading or link</option>';

    textElements.forEach((element, index) => {

        const tag = element.tagName.toLowerCase();

        const text = getDirectText(element)
            .replace(/\s+/g, " ")
            .trim();

        let type = tag;

        if (tag === "a") type = "Link";
        else if (tag === "button") type = "Button";
        else if (/^h[1-6]$/.test(tag)) type = "Heading";
        else if (tag === "p") type = "Paragraph";

        const option = document.createElement("option");

        option.value = index;
        option.textContent =
            `${index + 1}. ${type}: ${text.slice(0, 45)}`;

        textElementSelect.appendChild(option);

    });

    textElementSelect.onchange = function () {

        if (this.value === "") {
            selectTextElement(-1);
        } else {
            selectTextElement(Number(this.value));
        }

    };

    selectedTextElement = null;
    textContentInput.value = "";

}


/* ============================================
   DIRECT TEXT
============================================ */

function getDirectText(element) {

    return Array.from(element.childNodes)
        .filter(node => node.nodeType === Node.TEXT_NODE)
        .map(node => node.textContent)
        .join("")
        .trim();

}


function setDirectText(element, newText) {

    const doc = getDocument();

    const textNodes = Array.from(element.childNodes)
        .filter(node => node.nodeType === Node.TEXT_NODE);

    if (textNodes.length > 0) {

        textNodes[0].textContent = newText;

        for (let i = 1; i < textNodes.length; i++) {
            textNodes[i].textContent = "";
        }

    } else {

        element.insertBefore(
            doc.createTextNode(newText),
            element.firstChild
        );

    }

}


/* ============================================
   SELECT TEXT
============================================ */

function selectTextElement(index) {

    if (selectedTextElement) {
        selectedTextElement.style.outline = "";
    }

    selectedTextElement = textElements[index] || null;

    if (!selectedTextElement) {
        textContentInput.value = "";
        return;
    }

    selectedTextElement.style.outline = "2px dashed #16a34a";

    textContentInput.value =
        getDirectText(selectedTextElement);

    selectedTextElement.scrollIntoView({
        behavior: "smooth",
        block: "center"
    });

    showStatus(
        "Selected " +
        selectedTextElement.tagName.toLowerCase()
    );

}


/* ============================================
   DISCOVER IMAGES
============================================ */

function discoverImages() {

    images = [];

    if (!selectedSection) return;

    images = Array.from(
        selectedSection.querySelectorAll("img")
    );

    imageSelect.innerHTML =
        '<option value="">Select an image</option>';

    images.forEach((img, index) => {

        const option = document.createElement("option");

        option.value = index;

        const description = img.alt || "Image " + (index + 1);

        option.textContent =
            `Image ${index + 1} - ${description.slice(0, 35)}`;

        imageSelect.appendChild(option);

    });

    imageSelect.onchange = function () {

        if (this.value !== "") {
            selectImage(Number(this.value));
        } else {
            selectImage(-1);
        }

    };

    selectedImageElement = null;
    selectedImageData = null;

    imageInput.value = "";

}


/* ============================================
   SELECT IMAGE
============================================ */

function selectImage(index) {

    if (selectedImageElement) {
        selectedImageElement.style.outline = "";
    }

    selectedImageElement = images[index] || null;

    if (!selectedImageElement) return;

    selectedImageElement.style.outline = "4px solid #16a34a";

    selectedImageElement.scrollIntoView({
        behavior: "smooth",
        block: "center"
    });

    showStatus(
        "Image " + (index + 1) +
        " selected. Upload its replacement."
    );

}


/* ============================================
   PREVIEW CLICK SELECTION
============================================ */

function installPreviewSelection() {

    const doc = getDocument();

    if (previewClickHandler) {
        doc.removeEventListener(
            "click",
            previewClickHandler,
            true
        );
    }

    previewClickHandler = function (event) {

        const clickedElement = event.target;

        const clickedImage = clickedElement.closest("img");

        if (clickedImage) {

            event.preventDefault();
            event.stopPropagation();

            const ownerIndex = sections.findIndex(section =>
                section === clickedImage ||
                section.contains(clickedImage)
            );

            if (ownerIndex !== -1) {

                selectSection(ownerIndex, null, false);

                const imageIndex = images.indexOf(clickedImage);

                if (imageIndex !== -1) {
                    imageSelect.value = String(imageIndex);
                    selectImage(imageIndex);
                }

            }

            return;

        }

        let current = clickedElement;
        let matchedText = null;

        while (current && current !== doc.body) {

            if (getDirectText(current)) {
                matchedText = current;
                break;
            }

            current = current.parentElement;

        }

        if (matchedText) {

            event.preventDefault();
            event.stopPropagation();

            const ownerIndex = sections.findIndex(section =>
                section === matchedText ||
                section.contains(matchedText)
            );

            if (ownerIndex !== -1) {

                selectSection(ownerIndex, null, false);

                const textIndex = textElements.indexOf(matchedText);

                if (textIndex !== -1) {

                    textElementSelect.value = String(textIndex);
                    selectTextElement(textIndex);

                }

            }

            return;

        }

        const ownerIndex = sections.findIndex(section =>
            section === clickedElement ||
            section.contains(clickedElement)
        );

        if (ownerIndex !== -1) {
            selectSection(ownerIndex);
        }

    };

    doc.addEventListener("click", previewClickHandler, true);

}


/* ============================================
   COLOUR CONVERSION
============================================ */

function toHex(color, fallback) {

    if (!color || color === "transparent") {
        return fallback;
    }

    const values = color.match(/\d+/g);

    if (!values || values.length < 3) {
        return fallback;
    }

    return "#" + values.slice(0, 3)
        .map(value =>
            Number(value).toString(16).padStart(2, "0")
        )
        .join("");

}


/* ============================================
   IMAGE UPLOAD
============================================ */

imageInput.addEventListener("change", function () {

    const file = this.files[0];

    if (!file) return;

    if (!selectedImageElement) {

        showStatus("First select an image from the dropdown.");

        this.value = "";
        return;

    }

    if (!file.type.startsWith("image/")) {

        showStatus("Please select a valid image file.");
        return;

    }

    const reader = new FileReader();

    reader.onload = function (event) {

        selectedImageData = event.target.result;

        showStatus("Replacement ready. Click Apply Changes.");

    };

    reader.readAsDataURL(file);

});


/* ============================================
   APPLY CHANGES
============================================ */

function applyChanges() {

    if (!selectedSection) {
        showStatus("Please select a section.");
        return;
    }

    if (selectedTextElement) {

        setDirectText(
            selectedTextElement,
            textContentInput.value
        );

    }

    selectedSection.style.setProperty(
        "background-color",
        backgroundInput.value
    );

    selectedSection.style.setProperty(
        "color",
        textColourInput.value
    );

    selectedSection.style.display =
        visibilityInput.checked ? "" : "none";

    if (selectedImageData) {

        if (!selectedImageElement) {
            showStatus("Select an image first.");
            return;
        }

        selectedImageElement.src = selectedImageData;
        selectedImageElement.removeAttribute("srcset");

        const picture = selectedImageElement.closest("picture");

        if (picture) {

            picture.querySelectorAll("source").forEach(source => {
                source.removeAttribute("srcset");
            });

        }

    }

    const currentIndex = sections.indexOf(selectedSection);

    selectedImageData = null;
    imageInput.value = "";

    selectSection(currentIndex, null, false);

    showStatus("Changes applied successfully.");

}


/* ============================================
   SAVE DRAFT
============================================ */

function saveWebsite() {

    try {

        const doc = getDocument();

        if (!doc || !doc.documentElement) {
            showStatus("Template is not ready.");
            return;
        }

        clearHighlights();

        const html =
            "<!DOCTYPE html>\n" +
            doc.documentElement.outerHTML;

        localStorage.setItem(storageKey(), html);

        showStatus("Draft saved successfully.");

    } catch (error) {

        console.error(error);

        showStatus("Unable to save. Try using smaller images.");

    }

}


/* ============================================
   RESTORE ORIGINAL
============================================ */

function restoreOriginal() {

    const confirmed = confirm(
        "Are you sure you want to restore the original template?\n\n" +
        "Your saved draft for this template will be deleted."
    );

    if (!confirmed) return;

    try {

        // Remove only this template's saved draft.
        localStorage.removeItem(storageKey());

        selectedSection = null;
        selectedTextElement = null;
        selectedImageElement = null;
        selectedImageData = null;

        sections = [];
        textElements = [];
        images = [];

        // Load the original HTML file again.
        iframe.removeAttribute("srcdoc");

        iframe.src = new URL(
            templatePath,
            window.location.href
        ).href;

        showStatus("Original template restored successfully.");

    } catch (error) {

        console.error(error);

        showStatus("Unable to restore original template.");

    }

}


/* ============================================
   CLEAR EDITOR HIGHLIGHTS
============================================ */

function clearHighlights() {

    if (selectedSection) {
        selectedSection.style.outline = "";
    }

    if (selectedTextElement) {
        selectedTextElement.style.outline = "";
    }

    if (selectedImageElement) {
        selectedImageElement.style.outline = "";
    }

}


/* ============================================
   PREVIEW WEBSITE
============================================ */

function previewWebsite() {

    try {

        const doc = getDocument();

        if (!doc || !doc.documentElement) {
            showStatus("Template is not ready.");
            return;
        }

        clearHighlights();

        const html =
            "<!DOCTYPE html>\n" +
            doc.documentElement.outerHTML;

        const blob = new Blob([html], {
            type: "text/html"
        });

        const url = URL.createObjectURL(blob);

        window.open(url, "_blank");

        showStatus("Preview opened.");

        setTimeout(() => URL.revokeObjectURL(url), 60000);

    } catch (error) {

        console.error(error);
        showStatus("Unable to open preview.");

    }

}


/* ============================================
   PUBLISH / DOWNLOAD
============================================ */

function publishWebsite() {

    try {

        const doc = getDocument();

        if (!doc || !doc.documentElement) {
            showStatus("Template is not ready.");
            return;
        }

        clearHighlights();

        const html =
            "<!DOCTYPE html>\n" +
            doc.documentElement.outerHTML;

        const blob = new Blob([html], {
            type: "text/html"
        });

        const url = URL.createObjectURL(blob);

        const link = document.createElement("a");

        link.href = url;
        link.download = "edited-event-website.html";

        document.body.appendChild(link);

        link.click();

        link.remove();

        setTimeout(() => {
            URL.revokeObjectURL(url);
        }, 3000);

        showStatus("Edited website downloaded successfully.");

    } catch (error) {

        console.error(error);
        showStatus("Unable to download website.");

    }

}


/* ============================================
   START EDITOR
============================================ */

loadTemplate();
