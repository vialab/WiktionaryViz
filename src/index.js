import { initializeMap, loadMapMarkers } from './visualizations/mapTranslations';
import { loadTranslations } from './dataProcessing/translationLoader';
import { drawNetworkGraph } from './visualizations/networkGraphSenses';
import { drawRadialChart } from './visualizations/radialChartTranslations';

async function showSection(sectionId, map) {
    console.log(`Attempting to show section: ${sectionId}`);

    // Hide all sections first
    document.querySelectorAll('.section').forEach(section => {
        section.style.display = 'none'; // Hide all sections
    });

    // Show the selected section
    const selectedSection = document.getElementById(sectionId);
    if (selectedSection) {
        selectedSection.style.display = 'block';
        console.log(`Section shown: ${sectionId}`);
    } else {
        console.warn(`Section not found: ${sectionId}`);
    }

    // If showing the map, invalidate size to adjust
    if (sectionId === 'map-container' && map && typeof map.invalidateSize === 'function') {
        setTimeout(() => {
            console.log("Invalidating map size...");
            map.invalidateSize();
        }, 100);
    } else if (sectionId === 'map-container') {
        console.error("Map instance is invalid or missing invalidateSize function.");
    }
}

function setActiveLink(linkId) {
    console.log(`Setting active link: ${linkId}`);
    // Remove 'active' from all links
    document.querySelectorAll('nav ul li a').forEach(link => {
        link.classList.remove('active');
    });

    // Add 'active' to the clicked link
    const activeLink = document.getElementById(linkId);
    if (activeLink) {
        activeLink.classList.add('active');
    } else {
        console.warn(`Link not found: ${linkId}`);
    }
}

document.addEventListener("DOMContentLoaded", async () => {
    console.log("Document loaded. Initializing...");

    const translations = await loadTranslations();
    if (translations) {
        console.log(`Loaded ${translations.length} translations.`);
    } else {
        console.error("Failed to load translations.");
    }

    // Initialize map and place markers
    const map = initializeMap('map');
    if (map && typeof map.invalidateSize === 'function') {
        console.log("Map initialized successfully.");
        await loadMapMarkers(map, translations);
    } else {
        console.error("Map failed to initialize or invalidateSize is not available.");
    }

    // Set up event listeners for navbar links
    document.getElementById('map-link').addEventListener('click', (e) => {
        e.preventDefault();
        setActiveLink('map-link');
        showSection('map-container', map);
    });

    // Update event listener in index.js
    document.getElementById('senses-network-link').addEventListener('click', async (e) => {
        e.preventDefault();
        setActiveLink('senses-network-link');
        showSection('senses-network');
        drawNetworkGraph('senses-network-container'); // Call the tree diagram function
    });


    document.getElementById('language-treemap-link').addEventListener('click', (e) => {
        e.preventDefault();
        setActiveLink('language-treemap-link');
        showSection('language-treemap');
    });

    document.getElementById('cluster-synonyms-link').addEventListener('click', (e) => {
        e.preventDefault();
        setActiveLink('cluster-synonyms-link');
        showSection('cluster-synonyms');
    });

    document.getElementById('evolution-timeline-link').addEventListener('click', (e) => {
        e.preventDefault();
        setActiveLink('evolution-timeline-link');
        showSection('evolution-timeline');
    });

    document.getElementById('phonetic-map-link').addEventListener('click', (e) => {
        e.preventDefault();
        setActiveLink('phonetic-map-link');
        showSection('phonetic-map');
    });

    document.getElementById('phonetic-dendrogram-link').addEventListener('click', (e) => {
        e.preventDefault();
        setActiveLink('phonetic-dendrogram-link');
        showSection('phonetic-dendrogram');
    });

    document.getElementById('radial-chart-link').addEventListener('click', (e) => {
        e.preventDefault();
        setActiveLink('radial-chart-link');
        showSection('radial-chart');
        drawRadialChart('radial-chart-container');
    });

    // Show the map section by default on page load
    setActiveLink('map-link');
    showSection('map-container', map);
    // setActiveLink('radial-chart-link');
    // showSection('radial-chart');
    // drawRadialChart('radial-chart-container');
});
