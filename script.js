// API Configuration
// Points to the backend API on Render in production, or localhost:5000 when developing locally
const API_BASE_URL = (function() {
    if (typeof window !== 'undefined' && window.location) {
        const hostname = window.location.hostname;
        if (hostname === 'localhost' || hostname === '127.0.0.1') {
            return window.location.port === '5000' ? window.location.origin : 'http://localhost:5000';
        }
        if (hostname.includes('onlinenewsscrapper.onrender.com')) {
            return window.location.origin;
        }
    }
    return 'https://onlinenewsscrapper.onrender.com';
})();



// Global state
let currentSearchId = null;
let allFetchedArticles = []; // complete un-filtered dataset
let currentFilteredArticles = []; // currently filtered dataset
let lastQuery = '';
let currentPage = 1;
let currentView = 'table'; // 'table' or 'cards'
let activeKeywordFilter = null;
let activeSourceFilter = null;

// DOM Elements
const searchInput = document.getElementById('searchInput');
const maxResultsSelect = document.getElementById('maxResults');
const searchBtn = document.getElementById('searchBtn');
const exportBtn = document.getElementById('exportBtn');
const loadingIndicator = document.getElementById('loadingIndicator');
const loadingMessage = document.getElementById('loadingMessage');
const errorMessage = document.getElementById('errorMessage');
const resultsSection = document.getElementById('resultsSection');
const resultsCount = document.getElementById('resultsCount');
const resultsBody = document.getElementById('resultsBody');

// Dashboard Widgets Elements
const analyticsSection = document.getElementById('analyticsSection');
const kpiTotal = document.getElementById('kpiTotal');
const kpiSources = document.getElementById('kpiSources');
const kpiTopSource = document.getElementById('kpiTopSource');
const keywordCloud = document.getElementById('keywordCloud');
const sourceDistribution = document.getElementById('sourceDistribution');

// Controls & View Elements
const tableFilter = document.getElementById('tableFilter');
const fromDateInput = document.getElementById('fromDate');
const toDateInput = document.getElementById('toDate');
const clearDateBtn = document.getElementById('clearDateBtn');
const sortSelect = document.getElementById('sortSelect');
const viewTableBtn = document.getElementById('viewTableBtn');
const viewCardsBtn = document.getElementById('viewCardsBtn');
const tableViewContainer = document.getElementById('tableViewContainer');
const cardsViewContainer = document.getElementById('cardsViewContainer');

// Modal Elements
const articleModal = document.getElementById('articleModal');
const modalClose = document.getElementById('modalClose');
const modalSource = document.getElementById('modalSource');
const modalDate = document.getElementById('modalDate');
const modalTitle = document.getElementById('modalTitle');
const modalAuthors = document.getElementById('modalAuthors');
const modalImageContainer = document.getElementById('modalImageContainer');
const modalImage = document.getElementById('modalImage');
const modalLoader = document.getElementById('modalLoader');
const modalText = document.getElementById('modalText');
const modalLink = document.getElementById('modalLink');

// Event Listeners
searchBtn.addEventListener('click', handleSearch);
exportBtn.addEventListener('click', handleExport);
searchInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        handleSearch();
    }
});

// Filter & Sort Listeners
tableFilter.addEventListener('input', applyFiltersAndRender);
fromDateInput.addEventListener('change', applyFiltersAndRender);
toDateInput.addEventListener('change', applyFiltersAndRender);
clearDateBtn.addEventListener('click', () => {
    fromDateInput.value = '';
    toDateInput.value = '';
    clearDateBtn.style.display = 'none';
    applyFiltersAndRender();
});
sortSelect.addEventListener('change', applyFiltersAndRender);

// View Toggle Listeners
viewTableBtn.addEventListener('click', () => setView('table'));
viewCardsBtn.addEventListener('click', () => setView('cards'));

// Modal Close Listeners
modalClose.addEventListener('click', closeModal);
window.addEventListener('click', (e) => {
    if (e.target === articleModal) {
        closeModal();
    }
});

// View Toggle Logic
function setView(viewType) {
    currentView = viewType;
    if (viewType === 'table') {
        viewTableBtn.classList.add('active');
        viewCardsBtn.classList.remove('active');
        tableViewContainer.style.display = 'block';
        cardsViewContainer.style.display = 'none';
    } else {
        viewTableBtn.classList.remove('active');
        viewCardsBtn.classList.add('active');
        tableViewContainer.style.display = 'none';
        cardsViewContainer.style.display = 'grid';
    }
}

// Search Handler
async function handleSearch() {
    const query = searchInput.value.trim();
    const maxResults = parseInt(maxResultsSelect.value);

    if (!query) {
        showError('Please enter a search term');
        return;
    }

    // Handle pagination / same query logic
    if (query.toLowerCase() === lastQuery.toLowerCase()) {
        currentPage++;
        console.log(`Same query detected. Fetching next slice (Page: ${currentPage})`);
    } else {
        currentPage = 1;
        lastQuery = query;
        console.log(`New query: "${query}". Starting from Page 1.`);
    }

    hideError();
    activeKeywordFilter = null;
    activeSourceFilter = null;

    if (currentPage === 1) {
        hideResults();
        analyticsSection.style.display = 'none';
        allFetchedArticles = [];
        resultsBody.innerHTML = '';
        cardsViewContainer.innerHTML = '';
    }

    loadingMessage.textContent = currentPage === 1 
        ? 'Crawling Google News & resolving links in parallel...' 
        : `Loading more articles for "${query}" (Page ${currentPage})...`;
    showLoading();

    try {
        const response = await fetch(`${API_BASE_URL}/api/search`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                query: query,
                max_results: maxResults,
                page: currentPage
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to fetch news articles');
        }

        currentSearchId = data.search_id;
        
        if (currentPage === 1) {
            allFetchedArticles = data.articles;
        } else {
            // Append and deduplicate by URL
            const existingUrls = new Set(allFetchedArticles.map(a => a.url.toLowerCase()));
            const newArticles = data.articles.filter(a => !existingUrls.has(a.url.toLowerCase()));
            allFetchedArticles = [...allFetchedArticles, ...newArticles];
        }

        // Initialize display
        document.getElementById('tableFilter').value = '';
        if (fromDateInput) fromDateInput.value = '';
        if (toDateInput) toDateInput.value = '';
        if (clearDateBtn) clearDateBtn.style.display = 'none';
        document.getElementById('sortSelect').value = 'default';
        
        // Display dashboard widgets and results
        renderDashboard(allFetchedArticles);
        applyFiltersAndRender();

    } catch (error) {
        console.error('Search error:', error);
        showError(`Error: ${error.message}. Make sure your Backend server is started.`);
        lastQuery = '';
        currentPage = 1;
    } finally {
        hideLoading();
    }
}

// Render Dashboard Analytics Section
function renderDashboard(articles) {
    if (!articles || articles.length === 0) {
        analyticsSection.style.display = 'none';
        return;
    }

    // 1. KPI Calculations
    kpiTotal.textContent = articles.length;

    const sources = articles.map(a => a.source || 'Unknown');
    const uniqueSources = new Set(sources);
    kpiSources.textContent = uniqueSources.size;

    const sourceCounts = {};
    sources.forEach(s => sourceCounts[s] = (sourceCounts[s] || 0) + 1);
    
    let topSource = 'N/A';
    let topCount = 0;
    Object.entries(sourceCounts).forEach(([src, count]) => {
        if (count > topCount) {
            topCount = count;
            topSource = src;
        }
    });
    kpiTopSource.textContent = `${topSource} (${topCount})`;
    kpiTopSource.title = `${topSource} (${topCount})`;

    // 2. Keyword Cloud Extraction
    const topKeywords = extractKeywords(articles);
    keywordCloud.innerHTML = '';
    topKeywords.forEach(kw => {
        const span = document.createElement('span');
        span.className = `keyword-tag ${activeKeywordFilter === kw.word ? 'active' : ''}`;
        span.textContent = `${kw.word} (${kw.count})`;
        span.addEventListener('click', () => toggleKeywordFilter(kw.word));
        keywordCloud.appendChild(span);
    });

    // 3. Source Distribution Rendering
    const sortedSources = Object.entries(sourceCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8); // Top 8 sources

    sourceDistribution.innerHTML = '';
    sortedSources.forEach(([src, count]) => {
        const percentage = Math.round((count / articles.length) * 100);
        
        const row = document.createElement('div');
        row.className = 'source-item';
        if (activeSourceFilter === src) {
            row.style.background = 'rgba(157, 78, 221, 0.15)';
        }
        
        row.innerHTML = `
            <span class="source-name" title="${src}">${src}</span>
            <div class="source-progress-wrapper">
                <div class="source-progress-bar" style="width: ${percentage}%"></div>
            </div>
            <span class="source-count">${count}</span>
        `;
        row.addEventListener('click', () => toggleSourceFilter(src));
        sourceDistribution.appendChild(row);
    });

    analyticsSection.style.display = 'block';
}

// Extract Top Keywords from Titles
function extractKeywords(articles) {
    const stopWords = new Set([
        'and', 'the', 'for', 'to', 'in', 'of', 'on', 'with', 'a', 'an', 'is', 'at', 'by', 'that', 'how', 'why', 'what', 'from',
        'it', 'this', 'new', 'latest', 'about', 'as', 'are', 'be', 'or', 'its', 'has', 'have', 'was', 'were', 'will',
        'can', 'not', 'but', 'more', 'than', 'our', 'your', 'their', 'us', 'we', 'they', 'them', 'who', 'which', 'whom',
        'says', 'first', 'after', 'during', 'could', 'would', 'should', 'here', 'there', 'when', 'where', 'some', 'any'
    ]);
    const counts = {};
    articles.forEach(art => {
        const title = art.title || '';
        const words = title.toLowerCase()
            .replace(/[^\w\s-]/g, '')
            .split(/\s+/);
        
        words.forEach(w => {
            if (w.length > 3 && !stopWords.has(w) && !/^\d+$/.test(w)) {
                counts[w] = (counts[w] || 0) + 1;
            }
        });
    });

    return Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([word, count]) => ({ word, count }));
}

// Toggle Filters
function toggleKeywordFilter(keyword) {
    if (activeKeywordFilter === keyword) {
        activeKeywordFilter = null;
    } else {
        activeKeywordFilter = keyword;
        activeSourceFilter = null; // Clear other filter category
    }
    renderDashboard(allFetchedArticles);
    applyFiltersAndRender();
}

function toggleSourceFilter(source) {
    if (activeSourceFilter === source) {
        activeSourceFilter = null;
    } else {
        activeSourceFilter = source;
        activeKeywordFilter = null; // Clear other filter category
    }
    renderDashboard(allFetchedArticles);
    applyFiltersAndRender();
}

// Filter and Sort Controller
function applyFiltersAndRender() {
    let filtered = [...allFetchedArticles];

    // Apply Active Analytics Filter
    if (activeKeywordFilter) {
        filtered = filtered.filter(art => 
            (art.title && art.title.toLowerCase().includes(activeKeywordFilter)) ||
            (art.description && art.description.toLowerCase().includes(activeKeywordFilter))
        );
    } else if (activeSourceFilter) {
        filtered = filtered.filter(art => art.source === activeSourceFilter);
    }

    // Apply Text Input Search Filter
    const filterText = tableFilter.value.trim().toLowerCase();
    if (filterText) {
        filtered = filtered.filter(art => 
            (art.title && art.title.toLowerCase().includes(filterText)) ||
            (art.description && art.description.toLowerCase().includes(filterText)) ||
            (art.source && art.source.toLowerCase().includes(filterText))
        );
    }

    // Apply Date Range Filter (From Date to To Date)
    const fromDateVal = fromDateInput.value;
    const toDateVal = toDateInput.value;
    
    if (fromDateVal || toDateVal) {
        clearDateBtn.style.display = 'inline-flex';
        const fromDate = fromDateVal ? new Date(fromDateVal + 'T00:00:00') : null;
        const toDate = toDateVal ? new Date(toDateVal + 'T23:59:59') : null;

        filtered = filtered.filter(art => {
            if (!art.published_date || art.published_date === 'N/A') return false;
            const artDate = new Date(art.published_date);
            if (isNaN(artDate.getTime())) return false;
            if (fromDate && artDate < fromDate) return false;
            if (toDate && artDate > toDate) return false;
            return true;
        });
    } else {
        clearDateBtn.style.display = 'none';
    }

    // Apply Sort Selection
    const sortVal = sortSelect.value;
    if (sortVal === 'date-desc') {
        filtered.sort((a, b) => new Date(b.published_date || 0) - new Date(a.published_date || 0));
    } else if (sortVal === 'date-asc') {
        filtered.sort((a, b) => new Date(a.published_date || 0) - new Date(b.published_date || 0));
    } else if (sortVal === 'title-asc') {
        filtered.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    } else if (sortVal === 'source-asc') {
        filtered.sort((a, b) => (a.source || '').localeCompare(b.source || ''));
    }

    currentFilteredArticles = filtered;

    // Render results
    renderResults(currentFilteredArticles);
}

// Render Results to UI (Table and Cards)
function renderResults(articles) {
    // Render Results Header Info
    const countMessage = `Showing ${articles.length} of ${allFetchedArticles.length} articles found`;
    resultsCount.textContent = countMessage;

    // 1. Render Table View
    resultsBody.innerHTML = '';
    if (articles.length === 0) {
        resultsBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 30px; color: var(--text-secondary);">No articles matches your filters.</td></tr>';
    } else {
        articles.forEach((art, index) => {
            const tr = document.createElement('tr');
            
            // Format Date
            let showDate = 'N/A';
            if (art.published_date && art.published_date !== 'N/A') {
                try {
                    showDate = new Date(art.published_date).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric', year: 'numeric'
                    });
                } catch {
                    showDate = art.published_date;
                }
            }

            tr.innerHTML = `
                <td style="color: var(--text-muted); font-weight: 600;">${index + 1}</td>
                <td class="article-title-cell">${escapeHtml(art.title)}</td>
                <td class="article-desc-cell">${escapeHtml(art.description)}</td>
                <td><span class="source-badge" title="${escapeHtml(art.source)}">${escapeHtml(art.source)}</span></td>
                <td class="date-text">${showDate}</td>
                <td><a class="action-link">View Summary</a></td>
            `;

            // Click listener for Title and View Summary to open modal
            const openModalAction = () => openArticleModal(art);
            tr.querySelector('.article-title-cell').addEventListener('click', openModalAction);
            tr.querySelector('.action-link').addEventListener('click', openModalAction);

            resultsBody.appendChild(tr);
        });
    }

    // 2. Render Cards View
    cardsViewContainer.innerHTML = '';
    if (articles.length === 0) {
        cardsViewContainer.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-secondary);">No articles matches your filters.</div>';
    } else {
        articles.forEach(art => {
            const card = document.createElement('div');
            card.className = 'article-card card';

            let showDate = 'N/A';
            if (art.published_date && art.published_date !== 'N/A') {
                try {
                    showDate = new Date(art.published_date).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric'
                    });
                } catch {
                    showDate = art.published_date;
                }
            }

            card.innerHTML = `
                <div class="card-header">
                    <span class="card-source">${escapeHtml(art.source)}</span>
                    <span class="card-date">${showDate}</span>
                </div>
                <h3>${escapeHtml(art.title)}</h3>
                <p class="card-desc">${escapeHtml(art.description || 'No description snippet available.')}</p>
                <div class="card-footer">
                    <button class="read-btn">Read Summary &rarr;</button>
                    <a href="${escapeHtml(art.url)}" target="_blank" rel="noopener noreferrer" class="original-link">Original link</a>
                </div>
            `;

            // Open modal on click
            const openModalAction = () => openArticleModal(art);
            card.querySelector('h3').addEventListener('click', openModalAction);
            card.querySelector('.read-btn').addEventListener('click', openModalAction);

            cardsViewContainer.appendChild(card);
        });
    }

    showResults();
}

// Modal Article Reader logic
async function openArticleModal(article) {
    // Fill static content
    modalTitle.textContent = article.title;
    modalSource.textContent = article.source || 'Google News';
    
    let showDate = 'N/A';
    if (article.published_date && article.published_date !== 'N/A') {
        try {
            showDate = new Date(article.published_date).toLocaleDateString('en-US', {
                month: 'long', day: 'numeric', year: 'numeric'
            });
        } catch {
            showDate = article.published_date;
        }
    }
    modalDate.textContent = showDate;
    modalAuthors.textContent = `Author: ${article.author && article.author !== 'N/A' ? article.author : 'Unknown'}`;
    modalLink.href = article.url;

    // Reset details view
    modalText.innerHTML = '';
    modalImageContainer.style.display = 'none';
    modalImage.src = '';
    
    // Show Modal
    articleModal.style.display = 'flex';
    document.body.style.overflow = 'hidden'; // Lock scroll

    // Show loading spinner
    modalLoader.style.display = 'block';

    try {
        // Fetch article full details from server
        const response = await fetch(`${API_BASE_URL}/api/details`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ url: article.url })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to fetch details');
        }

        // Show image if available
        if (data.top_image && data.top_image !== 'N/A') {
            modalImage.src = data.top_image;
            modalImageContainer.style.display = 'block';
        }

        // Set Authors if found
        if (data.authors && data.authors !== 'N/A') {
            modalAuthors.textContent = `Authors: ${data.authors}`;
        }

        // Display text summary
        if (data.text && data.text !== 'N/A') {
            modalText.textContent = data.text;
        } else {
            modalText.innerHTML = `<span style="color: var(--text-muted); font-style: italic;">We were unable to extract the text summary dynamically. You can read the full article by visiting the link below.</span>`;
        }

    } catch (e) {
        console.warn('Error loading details:', e);
        // Fallback: show description and alert
        modalText.innerHTML = `
            <p style="margin-bottom: 20px;">${escapeHtml(article.description)}</p>
            <span style="color: var(--text-muted); font-style: italic; font-size: 0.88rem;">Note: Dynamic summary could not be retrieved from the publisher site (${e.message}). Click 'Visit Original Article' to view full content.</span>
        `;
    } finally {
        modalLoader.style.display = 'none';
    }
}

function closeModal() {
    articleModal.style.display = 'none';
    document.body.style.overflow = ''; // Unlock scroll
}

// Export Excel handler with multi-tier resilient fallback
async function handleExport() {
    const exportArticles = (currentFilteredArticles && currentFilteredArticles.length > 0)
        ? currentFilteredArticles
        : allFetchedArticles;

    if (!exportArticles || exportArticles.length === 0) {
        showError('No search results to export. Try searching for news first.');
        return;
    }

    const originalBtnHTML = exportBtn.innerHTML;
    try {
        exportBtn.disabled = true;
        exportBtn.innerHTML = '<span class="btn-text">Exporting...</span><span class="btn-icon">⏳</span>';

        const cleanQuery = (lastQuery || 'news').replace(/[^a-zA-Z0-9_-]/g, '_');
        const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
        let filename = `news_${cleanQuery}_${timestamp}.xlsx`;

        let exported = false;

        // Strategy 1: Try cached search ID export
        if (currentSearchId) {
            try {
                const response = await fetch(`${API_BASE_URL}/api/export/${currentSearchId}`);
                if (response.ok) {
                    const disposition = response.headers.get('Content-Disposition');
                    if (disposition) {
                        const match = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(disposition);
                        if (match && match[1]) filename = match[1].replace(/['"]/g, '');
                    }
                    const blob = await response.blob();
                    triggerDownload(blob, filename);
                    exported = true;
                } else {
                    console.warn(`Search ID export returned status ${response.status}. Attempting direct POST export...`);
                }
            } catch (err) {
                console.warn('Strategy 1 error, attempting Strategy 2:', err);
            }
        }

        // Strategy 2: Try direct POST export with article payload
        if (!exported) {
            try {
                const response = await fetch(`${API_BASE_URL}/api/export`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        query: lastQuery || 'news',
                        articles: exportArticles
                    })
                });

                if (response.ok) {
                    const disposition = response.headers.get('Content-Disposition');
                    if (disposition) {
                        const match = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/.exec(disposition);
                        if (match && match[1]) filename = match[1].replace(/['"]/g, '');
                    }
                    const blob = await response.blob();
                    triggerDownload(blob, filename);
                    exported = true;
                } else {
                    console.warn(`Direct POST export returned status ${response.status}. Falling back to client-side export...`);
                }
            } catch (err) {
                console.warn('Strategy 2 error, falling back to Strategy 3 (client-side):', err);
            }
        }

        // Strategy 3: Client-side Excel (SheetJS) or CSV fallback
        if (!exported) {
            exportClientSide(exportArticles, filename);
            exported = true;
        }

        // Success state visual feedback
        exportBtn.innerHTML = '<span class="btn-text">Exported!</span><span class="btn-icon">✅</span>';
        setTimeout(() => {
            exportBtn.innerHTML = originalBtnHTML;
            exportBtn.disabled = false;
        }, 2000);

    } catch (error) {
        console.error('Export error:', error);
        showError(`Export failed: ${error.message}`);
        exportBtn.disabled = false;
        exportBtn.innerHTML = originalBtnHTML;
    }
}

// Client-side Excel or CSV export fallback
function exportClientSide(articles, filename) {
    const formattedData = articles.map((art, idx) => ({
        '#': idx + 1,
        'Title': art.title || 'N/A',
        'Description': art.description || 'N/A',
        'Author': art.author || 'N/A',
        'Source': art.source || 'N/A',
        'Published Date': art.published_date || 'N/A',
        'URL': art.url || 'N/A',
        'Image URL': art.image_url || 'N/A'
    }));

    if (typeof XLSX !== 'undefined') {
        const worksheet = XLSX.utils.json_to_sheet(formattedData);
        // Set column widths
        worksheet['!cols'] = [
            { wch: 5 },   // #
            { wch: 40 },  // Title
            { wch: 50 },  // Description
            { wch: 20 },  // Author
            { wch: 20 },  // Source
            { wch: 25 },  // Published Date
            { wch: 40 },  // URL
            { wch: 30 }   // Image URL
        ];
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'News Articles');
        XLSX.writeFile(workbook, filename);
    } else {
        // Fallback to CSV if XLSX library is not yet loaded
        const csvFilename = filename.replace(/\.xlsx$/, '.csv');
        const headers = ['#', 'Title', 'Description', 'Author', 'Source', 'Published Date', 'URL', 'Image URL'];
        const csvRows = [
            headers.join(','),
            ...formattedData.map(row => 
                headers.map(h => `"${String(row[h] || '').replace(/"/g, '""')}"`).join(',')
            )
        ];
        const csvBlob = new Blob([csvRows.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
        triggerDownload(csvBlob, csvFilename);
    }
}

// Helper to trigger browser file download
function triggerDownload(blob, filename) {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
}

// UI State Management Utilities
function showLoading() {
    loadingIndicator.style.display = 'block';
    searchBtn.disabled = true;
}

function hideLoading() {
    loadingIndicator.style.display = 'none';
    searchBtn.disabled = false;
}

function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
    setTimeout(hideError, 6000);
}

function hideError() {
    errorMessage.style.display = 'none';
}

function showResults() {
    resultsSection.style.display = 'block';
}

function hideResults() {
    resultsSection.style.display = 'none';
}

function escapeHtml(text) {
    if (!text || text === 'N/A') return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Check Backend Health on Initial Page Load
async function checkBackendHealth() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/health`);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();

        if (data.status === 'healthy') {
            console.log('Connected to Backend successfully.');
            if (!data.api_key_configured) {
                console.warn('NewsAPI is unconfigured. Fallback crawler will be active.');
                // Render custom notice inside search title
                const badge = document.querySelector('.search-title .badge');
                if (badge) {
                    badge.textContent = 'Crawler (Fallback Active)';
                    badge.style.background = 'rgba(0, 242, 254, 0.1)';
                    badge.style.borderColor = 'rgba(0, 242, 254, 0.3)';
                    badge.style.color = 'var(--accent-cyan)';
                }
            }
        }
    } catch (e) {
        console.warn('Backend health check notice:', e);
        // On free-tier Render, backend can take ~30-50s to wake up on first visit
        console.log(`Backend API is configured at ${API_BASE_URL}`);
    }
}

// Initialize on Load
window.addEventListener('load', () => {
    setView('table');
    checkBackendHealth();
});
