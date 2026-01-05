# NeuroStream 3D | fMRI Visualizer

**NeuroStream 3D** is an interactive web-based platform for exploring 4D fMRI data. It combines 3D spatial brain mapping with real-time functional connectivity analysis, utilizing "Scented Widgets" to guide temporal navigation.

##  Research Contribution
This project extends existing work in Information Design and Neuroinformatics by:
* **Scented Navigation:** Integrating Global Mean Signal waveforms into the time-slider to reduce "blind scrubbing" (*Willett et al., 2007*).
* **Network-Centric Visualization:** Utilizing the **Brainnetome Atlas (246 ROIs)** for parcellated network analysis rather than raw voxel-wise "blobs."
* **Real-time Connectivity:** Calculating dynamic Pearson Correlations on-the-fly between user-selected regions.

---

##  Tech Stack
* **3D Engine:** [Three.js](https://threejs.org/) (WebGL)
* **Data Visualization:** [Vega-Lite](https://vega.github.io/vega-lite/) (for BOLD curves and UI scents)
* **Bundler:** [Parcel](https://parceljs.org/)
* **Data Format:** GLB (Geometry) + JSON (Timeseries & Labels)

---

##  Installation & Setup

1. **Clone the repository**
   ```bash
   git clone [https://github.com/your-username/neurostream-3d.git](https://github.com/bisyee/ioi.git)
   cd ioi
2. **Clone the repository**
   ```bash
   npm install
3. **Launch Development Server**
    ```bash
   parcel index.html
Navigate to http://localhost:1234 in your browser.


## Features & Interaction1.
1. **Navigating Time (Scented Slider)**
The bottom slider features a Blue Waveform. These are "scents"—high peaks indicate high global brain activity. Use these as landmarks to find significant neural events quickly.
2. **Multi-Select & ConnectivityEnable**
 Multi-Select Mode in the control panel.Click two distinct regions to trigger a Pearson Correlation calculation.The system will output the $r$ value, indicating the strength of the functional relationship between those regions.
3. **Analytical SnapshotsFound an interesting correlation? Click Take Snapshot.**
This creates a "data card" on the right sidebar.Clicking the snapshot image will revert the entire application state (Time, View, and Selection) to that specific moment for further analysis.4. Anatomical FilteringUse the Network Filter to isolate specific functional systems (e.g., Motor, Visual, Frontal). This uses keywords from the Brainnetome Atlas to hide irrelevant regions and reduce visual clutter.

## References 
**Willett, W., Heer, J., & Agrawala, M. (2007).** Scented Widgets: Improving Navigation with Embedded Visualizations.
**Fan, L., et al. (2016).** The Human Brainnetome Atlas.
**Hutchison, R. M., et al. (2013).** Dynamic functional connectivity: Promise, issues, and interpretations.

## Contributors
Bisera Nikoloska
Kristjan Volk
