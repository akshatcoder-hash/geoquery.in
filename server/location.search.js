import * as fs from "fs";
import Fuse from "fuse.js";

class TrieNode {
  constructor() {
    this.children = {};
    this.endOfWord = false;
  }
}

class Trie {
  constructor() {
    this.root = new TrieNode();
  }

  insert(word) {
    let current = this.root;
    for (let i = 0; i < word.length; i++) {
      const char = word[i];
      if (!current.children[char]) {
        current.children[char] = new TrieNode();
      }
      current = current.children[char];
    }
    current.endOfWord = true;
  }

  searchPrefix(prefix) {
    let current = this.root;
    for (let i = 0; i < prefix.length; i++) {
      const char = prefix[i];
      if (!current.children[char]) {
        return [];
      }
      current = current.children[char];
    }
    return this.#findAllWordsWithPrefix(current, prefix);
  }

  #findAllWordsWithPrefix(node, prefix) {
    let words = [];
    if (node.endOfWord) {
      words.push(prefix);
    }
    for (const char in node.children) {
      words = words.concat(
        this.#findAllWordsWithPrefix(node.children[char], prefix + char),
      );
    }
    return words;
  }
}

export const Level = Object.freeze({
  STATE: {
    name: "state",
    path: "state",
    depth: 0,
  },
  DISTRICT: {
    name: "district",
    path: "state->district",
    depth: 1,
  },
  SUBDISTRICT: {
    name: "subDistrict",
    path: "state->district->subDistrict",
    depth: 2,
  },
  VILLAGE: {
    name: "village",
    path: "state->district->subDistrict->village",
    depth: 3,
  },
});

export class LocationSearch {
  constructor(filePath) {
    this.villagePreprocessedData = [];
    this.subDistrictPreprocessedData = [];
    this.districtPreprocessedData = [];
    this.statePreProcessedData = [];
    this.trie = new Trie();

    const jsonData = JSON.parse(fs.readFileSync(filePath));

    jsonData.forEach((stateData) => {
      this.statePreProcessedData.push({ state: stateData.state });
      this.trie.insert(stateData.state.toLowerCase()); // Insert state name into trie

      stateData.districts.forEach((districtData) => {
        this.districtPreprocessedData.push({
          state: stateData.state,
          district: districtData.district,
        });
        this.trie.insert(districtData.district.toLowerCase()); // Insert district name into trie

        districtData.subDistricts.forEach((subDistrictData) => {
          this.subDistrictPreprocessedData.push({
            state: stateData.state,
            district: districtData.district,
            subDistrict: subDistrictData.subDistrict,
          });
          this.trie.insert(subDistrictData.subDistrict.toLowerCase()); // Insert subDistrict name into trie

          subDistrictData.villages.forEach((village) => {
            if (village !== null) {
              this.villagePreprocessedData.push({
                state: stateData.state,
                district: districtData.district,
                subDistrict: subDistrictData.subDistrict,
                village: village,
              });
              this.trie.insert(village.toLowerCase()); // Insert village name into trie
            }
          });
        });
      });
    });
  }

  fuzzySearch(level, query, filters) {
    return this.#querySearch(level, query, 0.1, 0, filters);
  }

  search(level, query, filters) {
    return this.#querySearch(level, query, 0.0, 0, filters);
  }

  #querySearch(searchLevel, query, threshold, distance = 0, filters = null) {
    const options = {
      keys: [searchLevel.name],
      threshold,
      distance,
      isCaseSensitive: false,
    };
    let processedData;
    switch (searchLevel) {
      case Level.STATE:
        processedData = this.statePreProcessedData;
        break;
      case Level.DISTRICT:
        processedData = this.districtPreprocessedData;
        break;
      case Level.SUBDISTRICT:
        processedData = this.subDistrictPreprocessedData;
        break;
      case Level.VILLAGE:
        processedData = this.villagePreprocessedData;
        break;
      default:
        // Unreachable
        break;
    }

    if (filters !== null) {
      for (let nodeDepth = 0; nodeDepth < searchLevel.depth; nodeDepth++) {
        for (const filter of filters) {
          if (filter.level.depth !== nodeDepth) continue;
          let filteredData = [];
          for (let index = 0; index < processedData.length; index++) {
            if (
              processedData[index][`${filter.level.name}`]
                .toLowerCase()
                .includes(filter.query.toLowerCase())
            ) {
              filteredData.push(processedData[index]);
            }
          }
          processedData = filteredData;
        }
      }
    }

    // using the trie for initial filtering
    let initialCandidates = this.trie.searchPrefix(
      query.slice(0, 3).toLowerCase(),
    );
    processedData = processedData.filter((data) =>
      initialCandidates.some((candidate) =>
        data[searchLevel.name].toLowerCase().startsWith(candidate),
      ),
    );

    const fuse = new Fuse(processedData, options);
    const result = fuse.search(query);
    return result.map((entry) => ({ ...entry.item }));
  }
}
