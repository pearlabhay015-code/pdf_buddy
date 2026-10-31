/**
 * PDF Buddy
 * Clean, spacious, rounded aesthetic.
 * Full image editing: resize, brightness, sharpness, saturation,
 * rotation, reordering, custom naming, and instant PDF compilation.
 */

(() => {
  'use strict';

  // Global State
  let images = [];
  let sortableInstance = null;
  let activePreviewBlobUrl = null;
  let currentAdjustIndex = null;

  // DOM Elements
  const dropZone = document.getElementById('dropZone');
  const fileInput = document.getElementById('fileInput');
  const pdfFileNameInput = document.getElementById('pdfFileNameInput');
  
  const pageSizeSelect = document.getElementById('pageSizeSelect');
  const pageOrientationSelect = document.getElementById('pageOrientationSelect');
  const pageMarginSelect = document.getElementById('pageMarginSelect');
  const orientationOption = document.getElementById('orientationOption');

  const canvasEmptyState = document.getElementById('canvasEmptyState');
  const canvasFilledState = document.getElementById('canvasFilledState');
  const pagesCountHeading = document.getElementById('pagesCountHeading');
  const imagesGrid = document.getElementById('imagesGrid');
  
  const clearAllBtn = document.getElementById('clearAllBtn');
  const previewPdfBtn = document.getElementById('previewPdfBtn');
  const generatePdfBtn = document.getElementById('generatePdfBtn');

  // Preview Modal Elements
  const previewModal = document.getElementById('previewModal');
  const modalBackdrop = document.getElementById('modalBackdrop');
  const closeModalBtn = document.getElementById('closeModalBtn');
  const modalDownloadBtn = document.getElementById('modalDownloadBtn');
  const previewModalFilename = document.getElementById('previewModalFilename');
  const pdfPreviewIframe = document.getElementById('pdfPreviewIframe');

  // Image Adjustment Modal Elements
  const adjustModal = document.getElementById('adjustModal');
  const adjustModalBackdrop = document.getElementById('adjustModalBackdrop');
  const closeAdjustModalBtn = document.getElementById('closeAdjustModalBtn');
  const adjustModalTitle = document.getElementById('adjustModalTitle');
  const adjustPreviewImg = document.getElementById('adjustPreviewImg');
  const adjustDimText = document.getElementById('adjustDimText');

  const adjustScaleSlider = document.getElementById('adjustScaleSlider');
  const adjustScaleVal = document.getElementById('adjustScaleVal');
  const adjustBrightnessSlider = document.getElementById('adjustBrightnessSlider');
  const adjustBrightnessVal = document.getElementById('adjustBrightnessVal');
  const adjustSharpnessSlider = document.getElementById('adjustSharpnessSlider');
  const adjustSharpnessVal = document.getElementById('adjustSharpnessVal');
  const adjustSaturationSlider = document.getElementById('adjustSaturationSlider');
  const adjustSaturationVal = document.getElementById('adjustSaturationVal');
  const adjustApplyToAll = document.getElementById('adjustApplyToAll');
  const adjustResetBtn = document.getElementById('adjustResetBtn');
  const adjustSaveBtn = document.getElementById('adjustSaveBtn');

  const toastContainer = document.getElementById('toastContainer');

  // ---------------------------------------------------------------------------
  // Toast Notifications
  // ---------------------------------------------------------------------------
  function showToast(message, duration = 3000) {
    const toast = document.createElement('div');
    toast.className = 'clean-toast';
    toast.textContent = message;

    toastContainer.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add('visible');
    });

    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 300);
    }, duration);
  }

  // ---------------------------------------------------------------------------
  // Image Loading & Parsing
  // ---------------------------------------------------------------------------
  function processBlob(blob, defaultName = 'Image') {
    return new Promise((resolve, reject) => {
      if (!blob.type || !blob.type.startsWith('image/')) {
        reject(new Error('Item is not an image'));
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target.result;
        const img = new Image();
        img.onload = () => {
          resolve({
            id: 'img_' + Date.now() + '_' + Math.random().toString(36).substring(2, 8),
            name: blob.name || `${defaultName}_${images.length + 1}`,
            dataUrl: dataUrl,
            width: img.naturalWidth || img.width,
            height: img.naturalHeight || img.height,
            rotation: 0,
            scale: 100,         // 25% - 150%
            brightness: 100,    // 50% - 150%
            sharpness: 0,       // 0% - 100%
            saturation: 100     // 0% - 200%
          });
        };
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = dataUrl;
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(blob);
    });
  }

  async function handleIncomingBlobs(blobs, label = 'Image') {
    if (!blobs || blobs.length === 0) return;

    let addedCount = 0;
    for (const blob of blobs) {
      try {
        const item = await processBlob(blob, label);
        images.push(item);
        addedCount++;
      } catch (err) {
        console.warn('Skipped non-image blob:', err);
      }
    }

    if (addedCount > 0) {
      renderPages();
      showToast(
        addedCount === 1 
          ? `Added page ${images.length}` 
          : `Added ${addedCount} pages`
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Visible Canvas Drop & Paste Listeners
  // ---------------------------------------------------------------------------
  // 1. Click to browse files
  dropZone.addEventListener('click', (e) => {
    if (images.length > 0) {
      if (e.target.closest('.add-page-card')) {
        fileInput.click();
      }
      return;
    }
    fileInput.click();
  });

  fileInput.addEventListener('change', async (e) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files).filter(f => f.type.startsWith('image/'));
      await handleIncomingBlobs(files, 'Uploaded');
      fileInput.value = '';
    }
  });

  // 2. Drag & Drop on canvas
  ['dragenter', 'dragover'].forEach(name => {
    dropZone.addEventListener(name, (e) => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach(name => {
    dropZone.addEventListener(name, (e) => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
    });
  });

  dropZone.addEventListener('drop', async (e) => {
    e.preventDefault();
    if (e.dataTransfer && e.dataTransfer.files) {
      const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('image/'));
      await handleIncomingBlobs(files, 'Dropped');
    }
  });

  // Prevent default window drop so browser doesn't open the image in tab
  ['dragover', 'drop'].forEach(name => {
    window.addEventListener(name, (e) => {
      e.preventDefault();
    });
  });

  // 3. Paste anywhere (Ctrl + V)
  window.addEventListener('paste', async (e) => {
    if (document.activeElement === pdfFileNameInput && !e.clipboardData.files.length) {
      return;
    }

    const clipboardData = e.clipboardData;
    if (!clipboardData) return;

    const blobs = [];

    // Check items (screenshots from Win+Shift+S, Snipping Tool, PrintScreen)
    if (clipboardData.items) {
      for (let i = 0; i < clipboardData.items.length; i++) {
        const item = clipboardData.items[i];
        if (item.type.startsWith('image/')) {
          const file = item.getAsFile();
          if (file) blobs.push(file);
        }
      }
    }

    // Check files (copied image files from desktop or folder)
    if (blobs.length === 0 && clipboardData.files) {
      for (let i = 0; i < clipboardData.files.length; i++) {
        const file = clipboardData.files[i];
        if (file.type.startsWith('image/')) {
          blobs.push(file);
        }
      }
    }

    // Check HTML with base64 img tags
    if (blobs.length === 0) {
      const htmlText = clipboardData.getData('text/html');
      if (htmlText) {
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlText, 'text/html');
        const imgElements = doc.querySelectorAll('img');
        for (const img of imgElements) {
          const src = img.getAttribute('src');
          if (src && src.startsWith('data:image/')) {
            try {
              const res = await fetch(src);
              const blob = await res.blob();
              blobs.push(blob);
            } catch (err) {
              console.warn('Could not parse base64 image', err);
            }
          }
        }
      }
    }

    if (blobs.length > 0) {
      e.preventDefault();
      await handleIncomingBlobs(blobs, 'Screenshot');
    }
  });

  // ---------------------------------------------------------------------------
  // Gallery Rendering & Card Controls
  // ---------------------------------------------------------------------------
  function renderPages() {
    imagesGrid.innerHTML = '';

    if (images.length === 0) {
      canvasEmptyState.style.display = 'flex';
      canvasFilledState.style.display = 'none';
      clearAllBtn.disabled = true;
      previewPdfBtn.disabled = true;
      generatePdfBtn.disabled = true;
      return;
    }

    canvasEmptyState.style.display = 'none';
    canvasFilledState.style.display = 'flex';
    clearAllBtn.disabled = false;
    previewPdfBtn.disabled = false;
    generatePdfBtn.disabled = false;
    pagesCountHeading.textContent = `${images.length} ${images.length === 1 ? 'Page Added' : 'Pages Added'}`;

    images.forEach((item, index) => {
      const card = document.createElement('div');
      card.className = 'clean-page-card';
      card.dataset.index = index;

      const scaleFactor = (item.scale || 100) / 100;
      const displayW = Math.round(item.width * scaleFactor);
      const displayH = Math.round(item.height * scaleFactor);

      // Contrast boost computed from sharpness slider
      const contrastVal = 100 + (item.sharpness || 0) * 0.4;
      const filterStyle = `brightness(${item.brightness || 100}%) saturate(${item.saturation || 100}%) contrast(${contrastVal}%)`;

      card.innerHTML = `
        <div class="card-top">
          <span class="page-number-pill">Page ${index + 1}</span>
          <span style="font-size: 0.95rem; color: var(--text-muted); font-weight: 300;">
            ${displayW} &times; ${displayH} px ${item.scale !== 100 ? `(${item.scale}%)` : ''}
          </span>
        </div>
        <div class="card-preview-area" title="Drag to reorder">
          <img src="${item.dataUrl}" alt="Page ${index + 1}" style="transform: rotate(${item.rotation}deg); filter: ${filterStyle};" />
        </div>
        <div class="card-bottom-bar">
          <button class="card-icon-btn btn-adjust" type="button" title="Adjust Image (Resize, Brightness, Sharpness & Saturation)" aria-label="Adjust image">
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 20h9"></path>
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
            </svg>
          </button>
          <button class="card-icon-btn btn-rotate" type="button" title="Rotate 90° Clockwise" aria-label="Rotate image">
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path>
            </svg>
          </button>
          <button class="card-icon-btn btn-danger btn-remove" type="button" title="Remove Page" aria-label="Remove page">
            <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      `;

      // Button listeners
      const adjustBtn = card.querySelector('.btn-adjust');
      const rotateBtn = card.querySelector('.btn-rotate');
      const removeBtn = card.querySelector('.btn-remove');

      adjustBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openAdjustModal(index);
      });

      rotateBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        item.rotation = (item.rotation + 90) % 360;
        renderPages();
      });

      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        images.splice(index, 1);
        renderPages();
        showToast('Page removed');
      });

      imagesGrid.appendChild(card);
    });

    // Interactive "Add More Images" card at the end of the grid
    const addCard = document.createElement('div');
    addCard.className = 'add-page-card';
    addCard.tabIndex = 0;
    addCard.role = 'button';
    addCard.title = 'Add more images to document';
    addCard.setAttribute('aria-label', 'Add more images');
    addCard.innerHTML = `
      <div class="add-page-inner">
        <div class="add-card-icon">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </div>
        <span class="add-card-label">Add More Images</span>
        <span class="add-card-hint">Click or paste Ctrl+V</span>
      </div>
    `;

    addCard.addEventListener('click', (e) => {
      e.stopPropagation();
      fileInput.click();
    });

    addCard.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        fileInput.click();
      }
    });

    imagesGrid.appendChild(addCard);

    initSortable();
  }

  function initSortable() {
    if (sortableInstance) {
      sortableInstance.destroy();
      sortableInstance = null;
    }

    if (window.Sortable && imagesGrid) {
      sortableInstance = new window.Sortable(imagesGrid, {
        animation: 200,
        handle: '.card-preview-area',
        draggable: '.clean-page-card',
        filter: '.add-page-card',
        preventOnFilter: false,
        onEnd: (evt) => {
          if (evt.oldIndex !== evt.newIndex) {
            const moved = images.splice(evt.oldIndex, 1)[0];
            images.splice(evt.newIndex, 0, moved);
            renderPages();
          }
        }
      });
    }
  }

  clearAllBtn.addEventListener('click', () => {
    if (images.length === 0) return;
    if (confirm('Clear all added pages?')) {
      images = [];
      renderPages();
      showToast('All pages cleared');
    }
  });

  // ---------------------------------------------------------------------------
  // Image Adjustment Modal Logic
  // ---------------------------------------------------------------------------
  function openAdjustModal(index) {
    currentAdjustIndex = index;
    const item = images[index];
    if (!item) return;

    adjustModalTitle.textContent = `Adjust Page ${index + 1}`;
    adjustPreviewImg.src = item.dataUrl;

    adjustScaleSlider.value = item.scale !== undefined ? item.scale : 100;
    adjustBrightnessSlider.value = item.brightness !== undefined ? item.brightness : 100;
    adjustSharpnessSlider.value = item.sharpness !== undefined ? item.sharpness : 0;
    adjustSaturationSlider.value = item.saturation !== undefined ? item.saturation : 100;
    adjustApplyToAll.checked = false;

    updateAdjustPreview();
    adjustModal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  function updateAdjustPreview() {
    const scale = parseInt(adjustScaleSlider.value, 10);
    const brightness = parseInt(adjustBrightnessSlider.value, 10);
    const sharpness = parseInt(adjustSharpnessSlider.value, 10);
    const saturation = parseInt(adjustSaturationSlider.value, 10);

    adjustScaleVal.textContent = `${scale}%`;
    adjustBrightnessVal.textContent = `${brightness}%`;
    adjustSharpnessVal.textContent = `${sharpness}%`;
    adjustSaturationVal.textContent = `${saturation}%`;

    const item = images[currentAdjustIndex];
    if (item) {
      const calcW = Math.round(item.width * (scale / 100));
      const calcH = Math.round(item.height * (scale / 100));
      adjustDimText.textContent = `Output Size: ${calcW} × ${calcH} px (${scale}%)`;
    }

    const contrastVal = 100 + sharpness * 0.4;
    adjustPreviewImg.style.filter = `brightness(${brightness}%) saturate(${saturation}%) contrast(${contrastVal}%)`;
  }

  [adjustScaleSlider, adjustBrightnessSlider, adjustSharpnessSlider, adjustSaturationSlider].forEach(slider => {
    slider.addEventListener('input', updateAdjustPreview);
  });

  adjustResetBtn.addEventListener('click', () => {
    adjustScaleSlider.value = 100;
    adjustBrightnessSlider.value = 100;
    adjustSharpnessSlider.value = 0;
    adjustSaturationSlider.value = 100;
    updateAdjustPreview();
    showToast('Reset settings to original');
  });

  adjustSaveBtn.addEventListener('click', () => {
    if (currentAdjustIndex === null || !images[currentAdjustIndex]) {
      closeAdjustModal();
      return;
    }

    const newScale = parseInt(adjustScaleSlider.value, 10);
    const newBrightness = parseInt(adjustBrightnessSlider.value, 10);
    const newSharpness = parseInt(adjustSharpnessSlider.value, 10);
    const newSaturation = parseInt(adjustSaturationSlider.value, 10);
    const applyToAll = adjustApplyToAll.checked;

    if (applyToAll) {
      images.forEach(item => {
        item.scale = newScale;
        item.brightness = newBrightness;
        item.sharpness = newSharpness;
        item.saturation = newSaturation;
      });
      showToast('Applied adjustments to all pages');
    } else {
      const item = images[currentAdjustIndex];
      item.scale = newScale;
      item.brightness = newBrightness;
      item.sharpness = newSharpness;
      item.saturation = newSaturation;
      showToast(`Updated Page ${currentAdjustIndex + 1}`);
    }

    closeAdjustModal();
    renderPages();
  });

  function closeAdjustModal() {
    adjustModal.style.display = 'none';
    document.body.style.overflow = '';
    currentAdjustIndex = null;
  }

  closeAdjustModalBtn.addEventListener('click', closeAdjustModal);
  adjustModalBackdrop.addEventListener('click', closeAdjustModal);

  // ---------------------------------------------------------------------------
  // Canvas Sharpness Filter (3x3 Unsharp Convolution Kernel)
  // ---------------------------------------------------------------------------
  function applySharpnessKernel(ctx, width, height, amount) {
    if (amount <= 0) return;
    try {
      const imgData = ctx.getImageData(0, 0, width, height);
      const d = imgData.data;
      const copy = new Uint8ClampedArray(d);
      
      // Calculate convolution strength
      const k = (amount / 100) * 0.65;
      const center = 1 + 4 * k;

      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          const idx = (y * width + x) * 4;
          for (let c = 0; c < 3; c++) {
            const top = copy[((y - 1) * width + x) * 4 + c];
            const bottom = copy[((y + 1) * width + x) * 4 + c];
            const left = copy[(y * width + (x - 1)) * 4 + c];
            const right = copy[(y * width + (x + 1)) * 4 + c];
            const val = copy[idx + c] * center - (top + bottom + left + right) * k;
            d[idx + c] = Math.min(255, Math.max(0, val));
          }
        }
      }
      ctx.putImageData(imgData, 0, 0);
    } catch (err) {
      console.warn('Canvas pixel kernel failed, contrast filter used as fallback', err);
    }
  }

  // ---------------------------------------------------------------------------
  // Canvas Rotation & Preprocessing with Image Adjustments
  // ---------------------------------------------------------------------------
  function getProcessedImage(item) {
    return new Promise((resolve) => {
      const scaleFactor = (item.scale !== undefined ? item.scale : 100) / 100;
      const brightness = item.brightness !== undefined ? item.brightness : 100;
      const saturation = item.saturation !== undefined ? item.saturation : 100;
      const sharpness = item.sharpness !== undefined ? item.sharpness : 0;
      const contrastVal = 100 + sharpness * 0.4;

      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const rads = (item.rotation * Math.PI) / 180;
        const isSwapped = item.rotation === 90 || item.rotation === 270;

        const baseW = isSwapped ? img.naturalHeight : img.naturalWidth;
        const baseH = isSwapped ? img.naturalWidth : img.naturalHeight;

        // Apply scale factor to output canvas size
        canvas.width = Math.max(1, Math.round(baseW * scaleFactor));
        canvas.height = Math.max(1, Math.round(baseH * scaleFactor));

        // Apply brightness, saturation, and base contrast
        ctx.filter = `brightness(${brightness}%) saturate(${saturation}%) contrast(${contrastVal}%)`;

        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(rads);
        
        const drawW = img.naturalWidth * scaleFactor;
        const drawH = img.naturalHeight * scaleFactor;
        ctx.drawImage(img, -drawW / 2, -drawH / 2, drawW, drawH);

        // Reset filter
        ctx.filter = 'none';

        // Apply unsharp convolution kernel if sharpness > 0
        if (sharpness > 0) {
          applySharpnessKernel(ctx, canvas.width, canvas.height, sharpness);
        }

        resolve({
          dataUrl: canvas.toDataURL('image/jpeg', 0.95),
          width: canvas.width,
          height: canvas.height
        });
      };
      img.src = item.dataUrl;
    });
  }

  // ---------------------------------------------------------------------------
  // PDF Document Generation
  // ---------------------------------------------------------------------------
  function getCleanFileName() {
    let name = (pdfFileNameInput.value || '').trim();
    name = name.replace(/[\\/?%*:|"<>]/g, '_');
    name = name.replace(/\.pdf$/i, '');
    if (!name) name = 'Untitled';
    return `${name}.pdf`;
  }

  async function createPdf() {
    if (images.length === 0) {
      throw new Error('Please add at least one image first!');
    }

    const { jsPDF } = window.jspdf;
    const format = pageSizeSelect.value;
    const orientationChoice = pageOrientationSelect.value;
    const marginChoice = pageMarginSelect.value;
    const margin = Math.max(0, parseFloat(marginChoice) || 0);

    let doc = null;

    for (let i = 0; i < images.length; i++) {
      const processed = await getProcessedImage(images[i]);

      let pageW, pageH;
      let orientation = 'portrait';

      if (format === 'fit') {
        const pxToMm = 0.264583;
        pageW = processed.width * pxToMm + margin * 2;
        pageH = processed.height * pxToMm + margin * 2;
        orientation = pageW > pageH ? 'landscape' : 'portrait';
      } else {
        const baseW = format === 'a4' ? 210 : 215.9;
        const baseH = format === 'a4' ? 297 : 279.4;

        if (orientationChoice === 'auto') {
          orientation = processed.width > processed.height ? 'landscape' : 'portrait';
        } else {
          orientation = orientationChoice;
        }

        if (orientation === 'landscape') {
          pageW = Math.max(baseW, baseH);
          pageH = Math.min(baseW, baseH);
        } else {
          pageW = Math.min(baseW, baseH);
          pageH = Math.max(baseW, baseH);
        }
      }

      if (i === 0) {
        doc = new jsPDF({
          orientation: orientation,
          unit: 'mm',
          format: format === 'fit' ? [pageW, pageH] : format,
          compress: true
        });
      } else {
        doc.addPage(format === 'fit' ? [pageW, pageH] : format, orientation);
      }

      const printW = Math.max(pageW - margin * 2, 10);
      const printH = Math.max(pageH - margin * 2, 10);

      const imgRatio = processed.width / processed.height;
      const printRatio = printW / printH;

      let renderW, renderH;
      if (imgRatio > printRatio) {
        renderW = printW;
        renderH = printW / imgRatio;
      } else {
        renderH = printH;
        renderW = printH * imgRatio;
      }

      const renderX = margin + (printW - renderW) / 2;
      const renderY = margin + (printH - renderH) / 2;

      const type = processed.dataUrl.startsWith('data:image/png') ? 'PNG' : 'JPEG';
      doc.addImage(processed.dataUrl, type, renderX, renderY, renderW, renderH, undefined, 'FAST');
    }

    return doc;
  }

  // ---------------------------------------------------------------------------
  // Download Action
  // ---------------------------------------------------------------------------
  async function downloadPdf() {
    try {
      generatePdfBtn.textContent = 'Generating PDF...';
      generatePdfBtn.disabled = true;

      const doc = await createPdf();
      const fileName = getCleanFileName();
      doc.save(fileName);

      showToast(`Downloaded "${fileName}"!`);
    } catch (err) {
      showToast(err.message || 'Error creating PDF');
    } finally {
      generatePdfBtn.textContent = 'Download PDF';
      generatePdfBtn.disabled = false;
    }
  }

  generatePdfBtn.addEventListener('click', downloadPdf);

  // ---------------------------------------------------------------------------
  // Preview Modal
  // ---------------------------------------------------------------------------
  async function openPreview() {
    try {
      previewPdfBtn.textContent = 'Opening Preview...';
      previewPdfBtn.disabled = true;

      const doc = await createPdf();
      const fileName = getCleanFileName();

      if (activePreviewBlobUrl) {
        URL.revokeObjectURL(activePreviewBlobUrl);
      }

      const blob = doc.output('blob');
      activePreviewBlobUrl = URL.createObjectURL(blob);

      pdfPreviewIframe.src = activePreviewBlobUrl;
      previewModalFilename.textContent = fileName;
      previewModal.style.display = 'flex';
      document.body.style.overflow = 'hidden';
    } catch (err) {
      showToast(err.message || 'Error generating preview');
    } finally {
      previewPdfBtn.textContent = 'Preview PDF';
      previewPdfBtn.disabled = false;
    }
  }

  function closePreview() {
    previewModal.style.display = 'none';
    pdfPreviewIframe.src = 'about:blank';
    document.body.style.overflow = '';
    if (activePreviewBlobUrl) {
      URL.revokeObjectURL(activePreviewBlobUrl);
      activePreviewBlobUrl = null;
    }
  }

  previewPdfBtn.addEventListener('click', openPreview);
  closeModalBtn.addEventListener('click', closePreview);
  modalBackdrop.addEventListener('click', closePreview);
  modalDownloadBtn.addEventListener('click', () => {
    downloadPdf();
    closePreview();
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (adjustModal.style.display !== 'none') {
        closeAdjustModal();
      } else if (previewModal.style.display !== 'none') {
        closePreview();
      }
    }
  });

  // Show/Hide Orientation option depending on Page Layout
  function syncLayoutOptions() {
    if (pageSizeSelect.value === 'fit') {
      orientationOption.style.display = 'none';
    } else {
      orientationOption.style.display = 'flex';
    }
  }

  pageSizeSelect.addEventListener('change', syncLayoutOptions);

  // Sync state on startup & after browser form restoration / page refresh
  syncLayoutOptions();
  window.addEventListener('pageshow', syncLayoutOptions);

  // Initial setup
  renderPages();
})();
