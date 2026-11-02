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
  const pdfSheetsContainer = document.getElementById('pdfSheetsContainer');

  // Image Adjustment & Crop Modal Elements
  const adjustModal = document.getElementById('adjustModal');
  const adjustModalBackdrop = document.getElementById('adjustModalBackdrop');
  const closeAdjustModalBtn = document.getElementById('closeAdjustModalBtn');
  const adjustModalTitle = document.getElementById('adjustModalTitle');
  const adjustPreviewImg = document.getElementById('adjustPreviewImg');
  const cropStageWrapper = document.getElementById('cropStageWrapper');
  const cropOverlay = document.getElementById('cropOverlay');
  const cropBox = document.getElementById('cropBox');
  const cropBackdropTop = document.getElementById('cropBackdropTop');
  const cropBackdropBottom = document.getElementById('cropBackdropBottom');
  const cropBackdropLeft = document.getElementById('cropBackdropLeft');
  const cropBackdropRight = document.getElementById('cropBackdropRight');
  const cropSizeBadge = document.getElementById('cropSizeBadge');
  const cropPresetBtns = document.querySelectorAll('.crop-preset-btn[data-ratio]');
  const cropResetBtn = document.getElementById('cropResetBtn');

  const adjustBrightnessSlider = document.getElementById('adjustBrightnessSlider');
  const adjustBrightnessVal = document.getElementById('adjustBrightnessVal');
  const adjustSharpnessSlider = document.getElementById('adjustSharpnessSlider');
  const adjustSharpnessVal = document.getElementById('adjustSharpnessVal');
  const adjustSaturationSlider = document.getElementById('adjustSaturationSlider');
  const adjustSaturationVal = document.getElementById('adjustSaturationVal');
  const adjustApplyToAll = document.getElementById('adjustApplyToAll');
  const adjustResetBtn = document.getElementById('adjustResetBtn');
  const adjustSaveBtn = document.getElementById('adjustSaveBtn');

  // Crop Interactive State
  let currentCrop = { x: 0, y: 0, w: 1, h: 1 }; // normalized 0..1 coordinates
  let activeRatio = 'free'; // 'free', '1:1', '4:3', '16:9', '3:4'
  let isDraggingCrop = false;
  let activeHandle = null; // 'nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w', or 'box'
  let dragStartPointer = { x: 0, y: 0 };
  let dragStartCrop = { x: 0, y: 0, w: 1, h: 1 };

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
            originalDataUrl: dataUrl,
            originalWidth: img.naturalWidth || img.width,
            originalHeight: img.naturalHeight || img.height,
            width: img.naturalWidth || img.width,
            height: img.naturalHeight || img.height,
            rotation: 0,
            crop: null,
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

      const displayW = item.width;
      const displayH = item.height;

      // Contrast boost computed from sharpness slider
      const contrastVal = 100 + (item.sharpness || 0) * 0.4;
      const filterStyle = `brightness(${item.brightness || 100}%) saturate(${item.saturation || 100}%) contrast(${contrastVal}%)`;

      card.innerHTML = `
        <div class="card-top">
          <span class="page-number-pill">Page ${index + 1}</span>
          <span style="font-size: 0.95rem; color: var(--text-muted); font-weight: 300;">
            ${displayW} &times; ${displayH} px
          </span>
        </div>
        <div class="card-preview-area" title="Drag to reorder">
          <div class="card-drag-hint">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="9" cy="6" r="2"></circle>
              <circle cx="15" cy="6" r="2"></circle>
              <circle cx="9" cy="12" r="2"></circle>
              <circle cx="15" cy="12" r="2"></circle>
              <circle cx="9" cy="18" r="2"></circle>
              <circle cx="15" cy="18" r="2"></circle>
            </svg>
            <span>Hold to drag</span>
          </div>
          <img src="${item.dataUrl}" alt="Page ${index + 1}" style="transform: rotate(${item.rotation}deg); filter: ${filterStyle};" />
        </div>
        <div class="card-bottom-bar">
          <button class="card-icon-btn btn-move-prev" type="button" title="Move earlier" aria-label="Move earlier" ${index === 0 ? 'disabled' : ''}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="15 18 9 12 15 6"></polyline>
            </svg>
          </button>
          <button class="card-icon-btn btn-move-next" type="button" title="Move later" aria-label="Move later" ${index === images.length - 1 ? 'disabled' : ''}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="9 18 15 12 9 6"></polyline>
            </svg>
          </button>
          <button class="card-icon-btn btn-adjust" type="button" title="Crop & Edit Image (Crop, Brightness, Sharpness & Saturation)" aria-label="Crop and edit image">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 20h9"></path>
              <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path>
            </svg>
          </button>
          <button class="card-icon-btn btn-rotate" type="button" title="Rotate 90° Clockwise" aria-label="Rotate image">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path>
            </svg>
          </button>
          <button class="card-icon-btn btn-danger btn-remove" type="button" title="Remove Page" aria-label="Remove page">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      `;

      // Button listeners
      const movePrevBtn = card.querySelector('.btn-move-prev');
      const moveNextBtn = card.querySelector('.btn-move-next');
      const adjustBtn = card.querySelector('.btn-adjust');
      const rotateBtn = card.querySelector('.btn-rotate');
      const removeBtn = card.querySelector('.btn-remove');

      movePrevBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const curIdx = parseInt(card.dataset.index, 10);
        movePage(curIdx, curIdx - 1);
      });

      moveNextBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const curIdx = parseInt(card.dataset.index, 10);
        movePage(curIdx, curIdx + 1);
      });

      adjustBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openAdjustModal(parseInt(card.dataset.index, 10));
      });

      rotateBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const curIdx = parseInt(card.dataset.index, 10);
        images[curIdx].rotation = (images[curIdx].rotation + 90) % 360;
        renderPages();
      });

      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const curIdx = parseInt(card.dataset.index, 10);
        images.splice(curIdx, 1);
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

  function movePage(fromIndex, toIndex) {
    if (toIndex < 0 || toIndex >= images.length) return;
    const item = images.splice(fromIndex, 1)[0];
    images.splice(toIndex, 0, item);
    renderPages();
    showToast(`Moved to Page ${toIndex + 1}`);
  }

  function updateCardNumbering() {
    const cards = imagesGrid.querySelectorAll('.clean-page-card');
    cards.forEach((card, idx) => {
      card.dataset.index = idx;
      const pill = card.querySelector('.page-number-pill');
      if (pill) pill.textContent = `Page ${idx + 1}`;

      const movePrevBtn = card.querySelector('.btn-move-prev');
      const moveNextBtn = card.querySelector('.btn-move-next');
      if (movePrevBtn) movePrevBtn.disabled = (idx === 0);
      if (moveNextBtn) moveNextBtn.disabled = (idx === cards.length - 1);
    });
  }

  function initSortable() {
    if (sortableInstance) {
      sortableInstance.destroy();
      sortableInstance = null;
    }

    if (window.Sortable && imagesGrid) {
      sortableInstance = new window.Sortable(imagesGrid, {
        animation: 250,
        handle: '.card-preview-area',
        draggable: '.clean-page-card',
        filter: '.add-page-card',
        preventOnFilter: false,
        // Smooth touch behavior on mobile:
        delay: 150,
        delayOnTouchOnly: true,
        touchStartThreshold: 6,
        forceFallback: true,
        fallbackTolerance: 3,
        scroll: true,
        scrollSensitivity: 60,
        scrollSpeed: 20,
        ghostClass: 'sortable-ghost',
        chosenClass: 'sortable-chosen',
        dragClass: 'sortable-drag',
        onEnd: (evt) => {
          if (evt.oldIndex !== evt.newIndex) {
            const moved = images.splice(evt.oldIndex, 1)[0];
            images.splice(evt.newIndex, 0, moved);
            updateCardNumbering();
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
  // Image Adjustment & Crop Modal Logic
  // ---------------------------------------------------------------------------
  function updateCropBoxDOM() {
    currentCrop.w = Math.max(0.05, Math.min(1, currentCrop.w));
    currentCrop.h = Math.max(0.05, Math.min(1, currentCrop.h));
    currentCrop.x = Math.max(0, Math.min(1 - currentCrop.w, currentCrop.x));
    currentCrop.y = Math.max(0, Math.min(1 - currentCrop.h, currentCrop.y));

    const leftPct = currentCrop.x * 100;
    const topPct = currentCrop.y * 100;
    const widthPct = currentCrop.w * 100;
    const heightPct = currentCrop.h * 100;

    cropBox.style.left = `${leftPct}%`;
    cropBox.style.top = `${topPct}%`;
    cropBox.style.width = `${widthPct}%`;
    cropBox.style.height = `${heightPct}%`;

    cropBackdropTop.style.cssText = `top: 0; left: 0; width: 100%; height: ${topPct}%;`;
    cropBackdropBottom.style.cssText = `top: ${topPct + heightPct}%; left: 0; width: 100%; height: ${Math.max(0, 100 - (topPct + heightPct))}%;`;
    cropBackdropLeft.style.cssText = `top: ${topPct}%; left: 0; width: ${leftPct}%; height: ${heightPct}%;`;
    cropBackdropRight.style.cssText = `top: ${topPct}%; left: ${leftPct + widthPct}%; width: ${Math.max(0, 100 - (leftPct + widthPct))}%; height: ${heightPct}%;`;

    const item = images[currentAdjustIndex];
    if (item) {
      const origW = item.originalWidth || item.width;
      const origH = item.originalHeight || item.height;
      const cropW = Math.round(currentCrop.w * origW);
      const cropH = Math.round(currentCrop.h * origH);
      const isFull = currentCrop.x < 0.01 && currentCrop.y < 0.01 && currentCrop.w > 0.98 && currentCrop.h > 0.98;
      cropSizeBadge.textContent = isFull ? `${cropW} × ${cropH} px (Full)` : `${cropW} × ${cropH} px`;
    }
  }

  function applyRatioPreset(ratioStr) {
    activeRatio = ratioStr;
    cropPresetBtns.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.ratio === ratioStr);
    });

    if (ratioStr === 'free') {
      return;
    }

    const item = images[currentAdjustIndex];
    if (!item) return;

    const origW = item.originalWidth || item.width;
    const origH = item.originalHeight || item.height;

    const parts = ratioStr.split(':').map(Number);
    const targetRatio = parts[0] / parts[1]; // w / h in pixels
    const normRatio = targetRatio * (origH / origW); // ratio in normalized 0..1 space

    let newW, newH;
    if (normRatio <= 1) {
      newH = 1;
      newW = normRatio;
    } else {
      newW = 1;
      newH = 1 / normRatio;
    }

    currentCrop = {
      x: (1 - newW) / 2,
      y: (1 - newH) / 2,
      w: newW,
      h: newH
    };

    updateCropBoxDOM();
  }

  // Pointer & Touch drag interactions on Crop overlay
  cropOverlay.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    const handleEl = e.target.closest('.crop-handle');
    if (handleEl) {
      activeHandle = handleEl.dataset.handle;
    } else if (e.target.closest('#cropBox')) {
      activeHandle = 'box';
    } else {
      // Clicked on backdrop outside: reposition crop box centered on click
      const rect = cropOverlay.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        const clickX = (e.clientX - rect.left) / rect.width;
        const clickY = (e.clientY - rect.top) / rect.height;
        const initSize = 0.45;
        currentCrop = {
          x: Math.max(0, Math.min(1 - initSize, clickX - initSize / 2)),
          y: Math.max(0, Math.min(1 - initSize, clickY - initSize / 2)),
          w: initSize,
          h: initSize
        };
        updateCropBoxDOM();
        activeHandle = 'se';
      }
    }

    isDraggingCrop = true;
    dragStartPointer = { x: e.clientX, y: e.clientY };
    dragStartCrop = { ...currentCrop };
    try {
      cropOverlay.setPointerCapture(e.pointerId);
    } catch (err) {}
  });

  cropOverlay.addEventListener('pointermove', (e) => {
    if (!isDraggingCrop || !activeHandle) return;
    const rect = cropOverlay.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const dx = (e.clientX - dragStartPointer.x) / rect.width;
    const dy = (e.clientY - dragStartPointer.y) / rect.height;

    const minW = Math.max(0.05, 30 / rect.width);
    const minH = Math.max(0.05, 30 / rect.height);

    if (activeHandle === 'box') {
      const maxX = 1 - dragStartCrop.w;
      const maxY = 1 - dragStartCrop.h;
      currentCrop.x = Math.max(0, Math.min(maxX, dragStartCrop.x + dx));
      currentCrop.y = Math.max(0, Math.min(maxY, dragStartCrop.y + dy));
      currentCrop.w = dragStartCrop.w;
      currentCrop.h = dragStartCrop.h;
    } else {
      let x1 = dragStartCrop.x;
      let y1 = dragStartCrop.y;
      let x2 = dragStartCrop.x + dragStartCrop.w;
      let y2 = dragStartCrop.y + dragStartCrop.h;

      if (activeHandle.includes('w')) {
        x1 = Math.min(x2 - minW, Math.max(0, dragStartCrop.x + dx));
      }
      if (activeHandle.includes('e')) {
        x2 = Math.max(x1 + minW, Math.min(1, dragStartCrop.x + dragStartCrop.w + dx));
      }
      if (activeHandle.includes('n')) {
        y1 = Math.min(y2 - minH, Math.max(0, dragStartCrop.y + dy));
      }
      if (activeHandle.includes('s')) {
        y2 = Math.max(y1 + minH, Math.min(1, dragStartCrop.y + dragStartCrop.h + dy));
      }

      let newW = x2 - x1;
      let newH = y2 - y1;

      // Maintain locked aspect ratio if selected
      if (activeRatio !== 'free') {
        const item = images[currentAdjustIndex];
        if (item) {
          const origW = item.originalWidth || item.width;
          const origH = item.originalHeight || item.height;
          const parts = activeRatio.split(':').map(Number);
          const targetRatio = parts[0] / parts[1];
          const normRatio = targetRatio * (origH / origW);

          if (activeHandle === 'n' || activeHandle === 's') {
            newW = Math.min(1 - x1, newH * normRatio);
          } else {
            newH = Math.min(1 - y1, newW / normRatio);
            newW = newH * normRatio;
          }
        }
      }

      currentCrop = {
        x: x1,
        y: y1,
        w: Math.max(minW, Math.min(1 - x1, newW)),
        h: Math.max(minH, Math.min(1 - y1, newH))
      };
    }

    updateCropBoxDOM();
  });

  const stopCropDrag = (e) => {
    if (isDraggingCrop) {
      isDraggingCrop = false;
      activeHandle = null;
      try {
        if (e && e.pointerId && cropOverlay.hasPointerCapture(e.pointerId)) {
          cropOverlay.releasePointerCapture(e.pointerId);
        }
      } catch (err) {}
    }
  };

  cropOverlay.addEventListener('pointerup', stopCropDrag);
  cropOverlay.addEventListener('pointercancel', stopCropDrag);

  cropResetBtn.addEventListener('click', () => {
    currentCrop = { x: 0, y: 0, w: 1, h: 1 };
    activeRatio = 'free';
    cropPresetBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.ratio === 'free'));
    updateCropBoxDOM();
    showToast('Reset crop to full image');
  });

  cropPresetBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      applyRatioPreset(btn.dataset.ratio);
    });
  });

  function openAdjustModal(index) {
    currentAdjustIndex = index;
    const item = images[index];
    if (!item) return;

    adjustModalTitle.textContent = `Crop & Edit Page ${index + 1}`;
    
    // Always use originalDataUrl so user can re-crop without generational degradation
    const previewSrc = item.originalDataUrl || item.dataUrl;
    adjustPreviewImg.src = previewSrc;

    if (item.crop) {
      currentCrop = { ...item.crop };
    } else {
      currentCrop = { x: 0, y: 0, w: 1, h: 1 };
    }

    activeRatio = 'free';
    cropPresetBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.ratio === 'free'));

    adjustBrightnessSlider.value = item.brightness !== undefined ? item.brightness : 100;
    adjustSharpnessSlider.value = item.sharpness !== undefined ? item.sharpness : 0;
    adjustSaturationSlider.value = item.saturation !== undefined ? item.saturation : 100;
    adjustApplyToAll.checked = false;

    updateAdjustPreview();
    adjustModal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    // Position crop box once image layout is ready
    if (adjustPreviewImg.complete && adjustPreviewImg.naturalWidth > 0) {
      updateCropBoxDOM();
    } else {
      adjustPreviewImg.onload = () => updateCropBoxDOM();
    }
  }

  function updateAdjustPreview() {
    const brightness = parseInt(adjustBrightnessSlider.value, 10);
    const sharpness = parseInt(adjustSharpnessSlider.value, 10);
    const saturation = parseInt(adjustSaturationSlider.value, 10);

    adjustBrightnessVal.textContent = `${brightness}%`;
    adjustSharpnessVal.textContent = `${sharpness}%`;
    adjustSaturationVal.textContent = `${saturation}%`;

    const contrastVal = 100 + sharpness * 0.4;
    adjustPreviewImg.style.filter = `brightness(${brightness}%) saturate(${saturation}%) contrast(${contrastVal}%)`;
  }

  [adjustBrightnessSlider, adjustSharpnessSlider, adjustSaturationSlider].forEach(slider => {
    slider.addEventListener('input', updateAdjustPreview);
  });

  adjustResetBtn.addEventListener('click', () => {
    adjustBrightnessSlider.value = 100;
    adjustSharpnessSlider.value = 0;
    adjustSaturationSlider.value = 100;
    currentCrop = { x: 0, y: 0, w: 1, h: 1 };
    activeRatio = 'free';
    cropPresetBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.ratio === 'free'));
    updateAdjustPreview();
    updateCropBoxDOM();
    showToast('Reset settings to original');
  });

  function cropImageCanvas(originalSrc, crop, naturalW, naturalH) {
    return new Promise((resolve) => {
      const isFull = !crop || (crop.x < 0.005 && crop.y < 0.005 && crop.w > 0.995 && crop.h > 0.995);
      const img = new Image();
      img.onload = () => {
        if (isFull) {
          resolve({
            dataUrl: originalSrc,
            width: naturalW,
            height: naturalH
          });
          return;
        }

        const sx = Math.max(0, Math.round(crop.x * naturalW));
        const sy = Math.max(0, Math.round(crop.y * naturalH));
        const sw = Math.min(naturalW - sx, Math.max(1, Math.round(crop.w * naturalW)));
        const sh = Math.min(naturalH - sy, Math.max(1, Math.round(crop.h * naturalH)));

        const canvas = document.createElement('canvas');
        canvas.width = sw;
        canvas.height = sh;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);

        resolve({
          dataUrl: canvas.toDataURL('image/jpeg', 0.96),
          width: sw,
          height: sh
        });
      };
      img.src = originalSrc;
    });
  }

  adjustSaveBtn.addEventListener('click', async () => {
    if (currentAdjustIndex === null || !images[currentAdjustIndex]) {
      closeAdjustModal();
      return;
    }

    const newBrightness = parseInt(adjustBrightnessSlider.value, 10);
    const newSharpness = parseInt(adjustSharpnessSlider.value, 10);
    const newSaturation = parseInt(adjustSaturationSlider.value, 10);
    const applyToAll = adjustApplyToAll.checked;

    const item = images[currentAdjustIndex];
    const origSrc = item.originalDataUrl || item.dataUrl;
    const origW = item.originalWidth || item.width;
    const origH = item.originalHeight || item.height;

    // Apply crop to current image
    const croppedResult = await cropImageCanvas(origSrc, currentCrop, origW, origH);
    item.dataUrl = croppedResult.dataUrl;
    item.width = croppedResult.width;
    item.height = croppedResult.height;
    item.crop = (currentCrop.x < 0.005 && currentCrop.y < 0.005 && currentCrop.w > 0.995 && currentCrop.h > 0.995) 
      ? null 
      : { ...currentCrop };

    item.brightness = newBrightness;
    item.sharpness = newSharpness;
    item.saturation = newSaturation;

    if (applyToAll) {
      images.forEach((other, idx) => {
        if (idx !== currentAdjustIndex) {
          other.brightness = newBrightness;
          other.sharpness = newSharpness;
          other.saturation = newSaturation;
        }
      });
      showToast('Cropped image & applied filters to all pages');
    } else {
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

        canvas.width = Math.max(1, baseW);
        canvas.height = Math.max(1, baseH);

        // Apply brightness, saturation, and base contrast
        ctx.filter = `brightness(${brightness}%) saturate(${saturation}%) contrast(${contrastVal}%)`;

        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(rads);
        
        const drawW = img.naturalWidth;
        const drawH = img.naturalHeight;
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
  // Preview Modal (Paper Sheet View - 100% Reliable across Phone & Desktop)
  // ---------------------------------------------------------------------------
  async function openPreview() {
    try {
      previewPdfBtn.textContent = 'Opening Preview...';
      previewPdfBtn.disabled = true;

      const fileName = getCleanFileName();
      previewModalFilename.textContent = fileName;
      pdfSheetsContainer.innerHTML = '';

      const format = pageSizeSelect.value;
      const marginVal = parseInt(pageMarginSelect.value, 10) || 0;
      const userOrientation = pageOrientationSelect ? pageOrientationSelect.value : 'auto';

      for (let i = 0; i < images.length; i++) {
        const item = images[i];
        const processed = await getProcessedImage(item);

        let orientation = userOrientation;
        if (orientation === 'auto') {
          orientation = processed.width > processed.height ? 'landscape' : 'portrait';
        }

        // Calculate sheet aspect ratio and margin percent
        let sheetAspect = 1;
        let marginPercent = 0;

        if (format === 'a4') {
          sheetAspect = orientation === 'landscape' ? (297 / 210) : (210 / 297);
          const shortSideMm = 210;
          marginPercent = (marginVal / shortSideMm) * 100;
        } else if (format === 'letter') {
          sheetAspect = orientation === 'landscape' ? (279.4 / 215.9) : (215.9 / 279.4);
          const shortSideMm = 215.9;
          marginPercent = (marginVal / shortSideMm) * 100;
        } else {
          // Fit image
          sheetAspect = processed.width / processed.height;
          marginPercent = marginVal > 0 ? (marginVal / 160) * 100 : 0;
        }

        const sheetWrapper = document.createElement('div');
        sheetWrapper.className = 'pdf-sheet-wrapper';

        const sheetHeader = document.createElement('div');
        sheetHeader.className = 'pdf-sheet-header';
        sheetHeader.textContent = `Page ${i + 1} of ${images.length}`;

        const sheet = document.createElement('div');
        sheet.className = 'pdf-sheet';
        sheet.style.aspectRatio = `${sheetAspect}`;
        sheet.style.padding = `${marginPercent.toFixed(2)}%`;

        const img = document.createElement('img');
        img.src = processed.dataUrl;
        img.alt = `Page ${i + 1}`;

        sheet.appendChild(img);
        sheetWrapper.appendChild(sheetHeader);
        sheetWrapper.appendChild(sheet);
        pdfSheetsContainer.appendChild(sheetWrapper);
      }

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
    pdfSheetsContainer.innerHTML = '';
    document.body.style.overflow = '';
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
