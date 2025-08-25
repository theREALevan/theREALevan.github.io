---
permalink: /
title: "👋👋👋"
author_profile: true
redirect_from: 
  - /about/
  - /about.html
---

<!-- Page Title Styled Consistently with Other Headers -->
<h2 style="font-size: 2em; margin: 0 0 20px 0;">Hello there, I'm Evan!</h2>

<div class="about-section" style="margin: 20px 0; font-size: 1.2em; line-height: 1.4;">
  <p>I'm currently a senior at 
    <a href="https://www.cs.cornell.edu/" style="color: #007acc; text-decoration: none; font-weight: bold;">Cornell CS</a> pursuing B.A. in Computer Science. 
  </p>
  <p>My research encompasses 3D/4D computer vision and graphics. I am also an active member of Cornell University Artificial Intelligence 
    (<a href="https://cuai.github.io/" style="color: #007acc; text-decoration: none; font-weight: bold;">CUAI</a>).
  </p>
  <p>I am currently advised by Professor <a href="https://www.hadarelor.com/" style="color: #007acc; text-decoration: none; font-weight: bold;">Hadar Elor</a>. Previously, I collaborated with Professor Abe Davis on time-lapse reconstruction for mobile platforms.</p>
</div>

<!-- Projects Section with ID for navigation -->
<div id="projects" class="projects-section">
  <!-- Section Heading: Using similar style as Teaching Experiences -->
  <h2 style="font-size: 2em; margin-bottom: 20px;">💻 Projects</h2>

  <!-- Project 4 -->
  <div class="project-teaser" style="display: flex; align-items: flex-start; margin: 20px 0;">
    <!-- Left Column: Teaser Image -->
    <div class="teaser-image" style="flex: 0 0 300px;">
      <img src="/images/vggt.gif" alt="VGGT Teaser" style="width: 100%; border: 1px solid #ccc;">
    </div>
    <!-- Right Column: Short Description and Links -->
    <div class="teaser-description" style="flex: 1; padding-left: 20px;">
      <h3 style="margin-top: 0;">VGGT with Extreme Rotation (WIP)</h3>
      <p style="margin: 5px 0;">
        This project fine-tunes VGGT on a custom dataset and achieves state-of-the-art performance on extreme rotation prediction, incorporating novel attention weight analysis for enhanced model interpretability.
      </p>
      <!-- Links displayed side by side -->
      <a href="" style="color: #007acc; text-decoration: none; font-weight: bold;">[GitHub (Coming Soon)]</a>
    </div>
  </div>

  <!-- Project 1 -->
  <div class="project-teaser" style="display: flex; align-items: flex-start; margin: 20px 0;">
    <!-- Left Column: Teaser Image -->
    <div class="teaser-image" style="flex: 0 0 300px;">
      <img src="/images/ARSplat.gif" alt="ARSPLAT Teaser" style="width: 100%; border: 1px solid #ccc;">
    </div>
    <!-- Right Column: Short Description and Links -->
    <div class="teaser-description" style="flex: 1; padding-left: 20px;">
      <!-- Title -->
      <h3 style="margin-top: 0;">ARSplat: Mobile AR for Time-Lapse Tour</h3>
      <!-- Credit line: only the label "Credit:" is bolded -->
      <!-- <p class="credit" style="margin: 5px 0; font-size: 0.9em; color: #666;">
        <strong>Credit:</strong> Evan Zhang,
        <a href="https://www.trannhan.com/" target="_blank" rel="noopener noreferrer" style="color: blue; text-decoration: underline;">Nhan Tran</a>,
        <a href="https://abedavis.com/" target="_blank" rel="noopener noreferrer" style="color: blue; text-decoration: underline;">Abe Davis</a>
      </p> -->
      <!-- Description -->
      <p style="margin: 5px 0;">
        Leveraging iPhone's LiDAR camera, this project builds an App that captures and aligns multiple scenes of a changing environment, then visualizes the time-lapse.
      </p>
      <!-- Links displayed side by side -->
      <!-- <a href="https://github.com/megatran/ARSplat/tree/evan/ARSplat" target="_blank" rel="noopener noreferrer" style="color: #007acc; text-decoration: none; font-weight: bold; margin-right: 15px;">[GitHub]</a> -->
      <a href="/projects/arsplat.html" style="color: #007acc; text-decoration: none; font-weight: bold;">[Detail]</a>
    </div>
  </div>
  
  <!-- Project 1 -->
  <div class="project-teaser" style="display: flex; align-items: flex-start; margin: 20px 0;">
    <!-- Left Column: Teaser Image -->
    <div class="teaser-image" style="flex: 0 0 300px;">
      <img src="/images/grig2.gif" alt="GRIG Teaser" style="width: 100%; border: 1px solid #ccc;">
    </div>
    <!-- Right Column: Short Description and Links -->
    <div class="teaser-description" style="flex: 1; padding-left: 20px;">
      <!-- Title -->
      <h3 style="margin-top: 0;">Auto-Riggable Gaussian Characters</h3>
      <!-- Credit line: only the label "Credit:" is bolded -->
      <!-- <p class="credit" style="margin: 5px 0; font-size: 0.9em; color: #666;">
        <strong>Credit:</strong> Evan Zhang,
        <a href="https://jolfss.github.io/" target="_blank" rel="noopener noreferrer" style="color: blue; text-decoration: underline;">Sean Brynjólfsson</a>,
        Justin Tien-Smith
      </p> -->
      <!-- Description -->
      <p style="margin: 5px 0;">
        Leveraging dynamic gaussian splats with local rigidity constraints, this project decomposes moving subjects into animation-ready rigs.
      </p>
      <!-- Links displayed side by side -->
      <a href="https://github.com/jolfss/grig" target="_blank" rel="noopener noreferrer" style="color: #007acc; text-decoration: none; font-weight: bold; margin-right: 15px;">[GitHub]</a>
      <a href="/projects/grig.html" style="color: #007acc; text-decoration: none; font-weight: bold;">[Detail]</a>
    </div>
  </div>

  <!-- Project 2 -->
  <div class="project-teaser" style="display: flex; align-items: flex-start; margin: 20px 0;">
    <!-- Left Column: Teaser Image -->
    <div class="teaser-image" style="flex: 0 0 300px;">
      <img src="/images/clickbait.png" alt="Gaussian_seg Teaser" style="width: 100%; border: 1px solid #ccc;">
    </div>
    <!-- Right Column: Short Description and Links -->
    <div class="teaser-description" style="flex: 1; padding-left: 20px;">
      <h3 style="margin-top: 0;">Compositional Splatting for Construction Sites</h3>
      <!-- <p class="credit" style="margin: 5px 0; font-size: 0.9em; color: #666;">
        <strong>Credit:</strong> Evan Zhang,
        <a href="https://jolfss.github.io/" target="_blank" rel="noopener noreferrer" style="color: blue; text-decoration: underline;">Sean Brynjólfsson</a>,
        Dyllan Hofflich,
        Natalie Leung,
        Danish Qureshi
      </p> -->
      <p style="margin: 5px 0;">
        Leveraging gaussian splats for digital twin capture on construction sites, this project aims to simulate realistic construction environments and record the construction processes.
      </p>
      <!-- Links displayed side by side -->
      <a href="files/SplatConstruction.pdf" target="_blank" rel="noopener noreferrer" style="color: #007acc; text-decoration: none; font-weight: bold; margin-right: 15px;">[Project Paper]</a>
    </div>
  </div>

  <!-- Project 3 -->
  <div class="project-teaser" style="display: flex; align-items: flex-start; margin: 20px 0;">
    <!-- Left Column: Teaser Image -->
    <div class="teaser-image" style="flex: 0 0 300px;">
      <img src="/images/TheOne .png" alt="Gaussian_seg Teaser" style="width: 100%; border: 1px solid #ccc;">
    </div>
    <!-- Right Column: Short Description and Links -->
    <div class="teaser-description" style="flex: 1; padding-left: 20px;">
      <h3 style="margin-top: 0;">Zelda: Catch the Koroks</h3>
      <!-- <p class="credit" style="margin: 5px 0; font-size: 0.9em; color: #666;">
        <strong>Credit:</strong> Evan Zhang,
        Ethan Lin,
        Justin Tien-Smith
      </p> -->
      <p style="margin: 5px 0;">
        This project uses rasterization to render a mini game that is inspired by Zelda. Customized shaders are created to simulate grass, trees, terrain, etc.
      </p>
      <!-- Links displayed side by side -->
      <a href="files/Zelda.pdf" target="_blank" rel="noopener noreferrer" style="color: #007acc; text-decoration: none; font-weight: bold; margin-right: 15px;">[Project Paper]</a>
      <a href="https://youtu.be/AhoNw9ofmpk" style="color: #007acc; text-decoration: none; font-weight: bold;">[Project Video]</a>
    </div>
  </div>

  <!-- Project 4 -->
  <div class="project-teaser" style="display: flex; align-items: flex-start; margin: 20px 0;">
    <!-- Left Column: Teaser Image -->
    <div class="teaser-image" style="flex: 0 0 300px;">
      <img src="/images/up.png" alt="Gaussian_seg Teaser" style="width: 100%; border: 1px solid #ccc;">
    </div>
    <!-- Right Column: Short Description and Links -->
    <div class="teaser-description" style="flex: 1; padding-left: 20px;">
      <h3 style="margin-top: 0;">Apple Is All You Need</h3>
      <!-- <p class="credit" style="margin: 5px 0; font-size: 0.9em; color: #666;">
        <strong>Credit:</strong> Evan Zhang,
        Taylor Wang
      </p> -->
      <p style="margin: 5px 0;">
        This project implements a raytracer that renders a scene exclusively composed of apples. Various graphics techniques are used including constructive solid geometry, Fresnel refraction, defocus blur, etc.
      </p>
      <!-- Links displayed side by side -->
      <a href="files/apple.pdf" target="_blank" rel="noopener noreferrer" style="color: #007acc; text-decoration: none; font-weight: bold; margin-right: 15px;">[Project Paper]</a>
    </div>
  </div>
</div>

<!-- Teaching Experiences Section with ID for navigation -->
<div id="teaching" class="teaching-experiences" style="margin: 40px 0;">
  <!-- Section Heading -->
  <h2 style="font-size: 2em; margin-bottom: 20px;">🎓 Teaching Experiences</h2>
  
  <!-- List of Experiences -->
  <ul style="list-style-type: none; padding: 0;">
    <li style="margin-bottom: 10px;">
        <strong>2025 Fall:</strong> TA for CS 4787: Principles of Large-Scale Machine Learning Systems
    </li>
    <li style="margin-bottom: 10px;">
      <strong>2025 Spring:</strong> TA for CS 4670: Introduction to Computer Vision
    </li>
    <li style="margin-bottom: 10px;">
      <strong>2024 Fall:</strong> TA for CS 4820: Introduction to Analysis of Algorithms
    </li>
    <li style="margin-bottom: 10px;">
      <strong>2024 Spring:</strong> Consultant for CS 1112: Introduction to Computing: An Engineering and Science Perspective
    </li>
    <li style="margin-bottom: 10px;">
      <strong>2023 Fall:</strong> Consultant for CS 1112: Introduction to Computing: An Engineering and Science Perspective | Fall 2023
    </li>
  </ul>
</div>
