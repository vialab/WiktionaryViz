// src/dataProcessing/sensesLoader.js

import * as d3 from 'd3';

// Function to load full JSON data and extract the `senses` and `word` fields for analysis
export async function loadSenses() {
    console.log("Loading senses and word from tea.json...");
    try {
        const data = await d3.json('/tea.json');
        console.log("Senses and word loaded successfully.");
        return {
            senses: data.senses, // Return the `senses` field
            word: data.word      // Return the `word` field
        };
    } catch (error) {
        console.error("Error loading senses data:", error);
        return null;
    }
}
