# Semantic Hexbins

A light-weight demo app for geospatial semantic search. Designed for any kind of textual data with geospatial references.
Building on previous research:

- [An Application-Oriented Implementation of Hexagonal On-the-fly Binning Metrics for City-Scale Georeferenced Social Media Data](https://isprs-archives.copernicus.org/articles/XLVIII-4-W7-2023/253/2023/)
- [Developing a Privacy-Aware Map-Based Cross-Platform Social Media Dashboard for Municipal Decision-Making](https://isprs-archives.copernicus.org/articles/XLVIII-4-W1-2022/545/2022/)

Repository for the paper: XXX (still to submit)

![](screenshot_overview.png)

## Idea 

The paper describes an approach to use semantic similarity for geospatial purposes, like georeferenced social media data.

## Data samples

Ranging from 32 - 8 Mb for individual posts or 0.8 - 5.1 Mb for aggreagted posts, see data folder.

## Scripts

Scripts for data processing can be found here:
- https://gist.github.com/do-me/d60ea47d0dc97ba40c9d727bf26f7a77
- https://gist.github.com/do-me/dc8877049c2c074df3c7d8e707adf138
- https://github.com/do-me/fast-instagram-scraper

## Performance 

Tested devices: 

- Windows laptop with Intel i7-8550 CPU
- Ubuntu laptop with AMD Ryzen 7 PRO 6850U
- Android phone Samsung S9 with Exynos 9810
- Apple iPhone 15 Pro with A17 Pro

Run times for a full layer update are significantly below 200ms. Iphone 15 Pro averages 51ms (24ms for inferencing), averaged for 100 runs.
