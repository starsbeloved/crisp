# Accessible health instruments: directions for ideation

October 24, 2026. Research only. ECHO remains a baseline candidate; no project has been selected and implementation remains unauthorized.

**Completed first-pass method map:** [Part 1: ten established health measurements](health-methods-part-1.md). That report expands the exploratory notes below with specific mechanisms, references, data status, existing alternatives and feasibility judgments.

## The pattern to explore

Start with an established biomedical measurement. Find what makes it expensive or difficult to use: optics, calibration, sample preparation, expert interpretation or workflow. Ask whether simple hardware and software can lower that barrier. Keep the physical measurement separate from the medical inference.

## HackMIT examples

The [2026 project index](https://www.hackmit2026.com/) links to original submissions. Its list order should not be treated as a final ranking. These are prototype descriptions, not clinical validation.

| Project | Mechanism described by its creators | Transferable pattern |
|---|---|---|
| [Peel](https://plume.hackmit.org/project/qxodw-wgjqk-lidau-dxrpe) | Optical dissolution measurements, bottle/pill images and reference records | Combine a physical experiment with independent evidence. Dissolution is not chemical identity. |
| [OnTrack](https://plume.hackmit.org/project/bkosr-lsgra-ltfcy-ekkrm) | Shin IMU, freeze-like gait detector and rhythmic auditory cue | Connect a specific measured pattern to a specific response. Authors explicitly report no patient testing. |
| [Spidey Sense](https://plume.hackmit.org/project/bvbun-rvjwe-dwtmj-ljtag) | Microphone-array directional listening and head orientation | Geometry and signal processing give familiar sensors a useful new function. |
| [CareChair](https://plume.hackmit.org/project/yjrfb-ddfqs-evmsq-zfhgi) | Wheelchair-mounted robotics, body perception, bounded actions and voice | Adapt existing equipment into a physical care interface; integration burden is substantial. |

Peel is also documented in [RIT's team interview](https://www.rit.edu/ires/news/rit-student-wins-hackmit-low-cost-medicine-testing-device). Spidey Sense has a [creator account](https://www.linkedin.com/posts/troy-gwdn_i-just-won-hackmit-twice-in-a-row-last-activity-7510696925206097920-_FkR).

## Method 1: colorimetry and optical test readers

**Principle:** assay chemistry changes color; a camera measures that change relative to controls under repeatable lighting. The chemistry provides specificity. A generic camera/strip cannot identify arbitrary diseases.

**Possible instrument:** phone camera, fixed light, opaque enclosure, sample holder and reference patches. Software locates pads/lines, follows assay-specific read times, flags glare/saturation, normalizes color and applies a calibration curve.

**Public starting point:** [Smartphone Modulated Colorimetric Reader with Color Subtraction](https://github.com/zyfccc/Smartphone-Modulated-Colorimetric-Reader-with-Color-Subtraction-IEEE-Sensors-2019). Authors provide image data, code and enclosure models; the repository describes 174 pH-strip images with measured reference pH. This is color-analysis research data, not a general clinical-test dataset. Its old environment needs review before any reuse.

**Inspectable demo:** known reference solutions/strips, repeat measurements and rejection of an unusable image. A pH demonstration proves an instrument principle; it does not establish a health product. A clinical assay would require its own controls and instructions.

**Open question:** which specific user/test has an access or interpretation problem that existing readers do not solve adequately?

## Method 2: absorption, transmission and spectral channels

**Principle:** pass controlled light through a sample and compare intensity with a blank. Sequential sources or spectral channels supply wavelength-dependent measurements. Scattering can confound simple absorption interpretation.

**Possible instrument:** LEDs, suitable detector, repeatable optical path and dark enclosure. A generic lux sensor measures illuminance rather than a spectrum: see [VEML7700 documentation](https://www.vishay.com/docs/84286/veml7700.pdf).

**Inspectable demo:** calibrated dye dilutions or an optical change over time. This is close to Peel's experimental approach. Identifying an unknown compound requires a suitable specific measurement/reference, not simply a large model. Generic spectral libraries may not match our wavelengths, resolution or sample preparation.

## Method 3: microscopy with capture assistance

**Principle:** suitable inexpensive optics reveal microscopic structures; models segment/count objects in usable images. [Foldscope's original paper](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0098781) demonstrates an accessible optical design.

**Possible instrument:** phone, lens, stable stage, focus adjustment and transmitted illumination. Lens access, alignment and verified resolution are feasibility gates.

**Public data:** [Broad Bioimage Benchmark Collection](https://bbbc.broadinstitute.org/) and [NLM malaria imaging resources](https://data.lhncbc.nlm.nih.gov/public/Malaria/index.html). Select a specific dataset, imaging modality, task and license. A model trained on prepared clinical blood smears is not validated on an improvised phone microscope.

**Inspectable demo:** capture nonclinical samples, assess focus, count objects and review/correct annotations. Label clinical-dataset replay separately. Yeast/bead counting alone does not establish disease detection.

**Open question:** who needs these images/counts, and what sample preparation and resolution does that task require?

## Method 4: digital auscultation

**Principle:** acquire body sound/vibration through an appropriate chestpiece/contact transducer and audio chain. Signal processing and ML can segment or classify acoustic patterns.

**Possible instrument:** suitable microphone/contact sensor, acoustic coupling, and amplification/audio interface where necessary. The existing speaker is not a body-sound sensor. Acquisition quality must be checked.

**Public data:** [CirCor DigiScope](https://physionet.org/content/circor-heart-sound/1.0.3/) for heart sounds; [ICBHI](https://bhichallenge.med.auth.gr/) for respiratory sounds. Different equipment/populations mean these support offline algorithm exploration, not calibration of DIY hardware. Evaluate by participant.

**Inspectable demo:** record/replay an actual acoustic signal and show acquisition quality; separately explore annotated public recordings. A generic stethoscope classifier has substantial prior work, so differentiation remains necessary.

## Method 5: acoustic airflow measurement

**Principle:** airflow produces sound; designed whistle geometry can create a repeatable relationship. A microphone measures sound. Flow and volume estimates require suitable reference calibration.

**Prior work:** [SpiroSmart, UW](https://ubicomplab.cs.washington.edu/publications/spirosmart/) used phone audio and a research model evaluated against a spirometer. A separate [vortex-whistle study](https://www.mdpi.com/1424-8220/16/8/1305) uses a designed attachment. They are distinct approaches.

**Inspectable demo:** an acoustic spectrum responding to exhalation through a repeatable attachment. Valid lung-volume/FEV1 claims need a flow/volume reference and calibration. Lung-sound datasets do not supply those labels. No suitable public synchronized whistle dataset was verified in this research pass.

## Advanced inspiration

[UW smartphone middle-ear research](https://tymp.cs.washington.edu/) distinguishes earlier acoustic-reflection sensing from actual tympanometry, whose hardware changes pressure and measures eardrum response. This is a useful research direction, not a weekend ear-pressure-device recommendation.

Fluorescence excites a sample in one band and detects emitted light in another. Filters, illumination, geometry and controls matter. No readily obtainable optical stack/sample-reference combination was verified for our weekend.

## What AI contributes

- Instrument physics supplies a repeatable signal.
- Deterministic processing handles calibration, timing and basic quality checks.
- ML can segment, denoise or classify when appropriate labels and evaluation exist.
- Gemini can guide capture, invoke analysis, retrieve references and explain evidence.
- ElevenLabs can provide spoken protocols and explanations.

More data cannot recover a quantity the instrument does not identify. A small set of reference samples measured with our actual instrument can matter more than a large mismatched dataset.

## Recommended exploration order

Explore optical assay readers and assisted microscopy first; body-sound acquisition is a third candidate with public labeled data. This prioritizes research rather than selecting a final project. For each, establish the user, physical signal, essential components/consumables, ground truth, data transfer gap, existing alternatives and a live inspectable experiment.

No datasets downloaded, packages installed, purchases made, product code executed or instruments built during this research.

## Selection workflow: next research passes

The user wants to discover methods before selecting a project. Use three passes; these are research tasks, not permission to implement.

### Pass 1: instrument map

Compare optical assay readers, absorption/transmission measurements, microscopy/counting, digital auscultation, acoustic airflow, middle-ear acoustics, mechanical clot sensing and microscopic motility tracking. For each record: intended user/decision, established method and source, physical signal, access barrier, required components/consumables, appropriate ground truth, dataset availability and fit, existing accessible alternatives, and an inspectable weekend experiment. Mark unverified items explicitly.

Two additional examples demonstrate the search strategy:

- [Micro-mechanical blood clot testing using smartphones](https://www.nature.com/articles/s41467-022-28499-y): researchers couple phone vibration into a sample and use the camera to track a particle as clotting changes its motion. The established biological process becomes a visible mechanical signal. This is existing research, not a novel project claim. Clinical samples, reagents and reference validation make replication materially harder than the simple mechanism suggests. Source-data availability is not the same as a ready labeled video dataset.
- [Smartphone semen analysis](https://pubmed.ncbi.nlm.nih.gov/28330865/): optical attachment and sample handling support concentration/motility measurement. [VISEM's original dataset paper](https://home.simula.no/~paalh/publications/files/mmsys2019-sperm-dataset.pdf) provides a public video research route. Camera resolution, sample depth and optics govern whether counts/speeds can be quantified. Existing smartphone products and prior studies mean the unmet gap must be established before proposing this as a differentiated project. Motility/concentration do not by themselves establish fertility.

### Pass 2: three evidence briefs

For the strongest three, write one short brief each: beneficiary and concrete task; documented access problem; measurement mechanism; prior paper/product; proposed improvement; actual data and license; minimum parts; ground truth; honest live/replay demonstration; and the most likely reason it will fail. Prefer references and observed constraints over speculative numeric scores.

Reject or defer a candidate if the essential signal cannot be acquired with accessible components, no credible reference is available, or the remaining capability has no useful purpose. Public-dataset availability is helpful, not mandatory if known calibration standards are more appropriate.

### Pass 3: project concepts

Turn each surviving method into a one-sentence benefit and a 30-second physical demonstration. Compare with ECHO against real need, immediately understandable demonstration, useful playful interaction, meaningful sponsor fit and build feasibility. Only after selecting a concept define shared interfaces, the website journey, hardware/enclosure requirements and separate-session build tasks.
