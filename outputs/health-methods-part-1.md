# Part 1 — established health measurements we could adapt

Research pass: October 24, 2026. Planning only. ECHO remains a baseline; no project, purchase, clinical experiment or implementation is selected by this report.

## Scope and interpretation

This map identifies ten real measurement methods and their possible accessibility opportunities. An established clinical method is different from a published smartphone adaptation, and neither validates a new DIY instrument. Build-feasibility judgments below are engineering inferences based on our phone/laptop/UNO Q resources; no components or data files have been tested. Local stock, current purchase prices and printer availability were not checked.

“Data not verified” means no suitable openly downloadable raw benchmark was confirmed in the examined sources. It is not proof that no data exists. Public plots, source tables and working code are different from raw, labeled training samples. Physical standards can sometimes replace a training dataset for calibration.

## Overview

| Method | Physical signal | Possible access improvement | Main obstacle |
|---|---|---|---|
| Enzymatic/colorimetric assays | Reaction-dependent color | Consistent timing, capture and interpretation | Specific reagents and assay calibration |
| Lateral-flow immunoassays | Accumulation of labeled binding molecules | Assay-specific line reading and quality checks | Existing readers; kit-specific calibration |
| Plaque fluorescence | Red emission under violet excitation | Make otherwise hard-to-see deposits visible | Filters, illumination and biological variability |
| Microscopic motility analysis | Cell positions changing over time | Accessible capture/counting/tracking | Optics, sample chamber and preparation |
| Mechanical clot detection | Particle motion changing as a clot forms | Reuse phone vibration/camera | Reagents, specimens and clinical reference |
| Acoustic spirometry | Flow-generated sound or whistle frequency | Simplify airflow acquisition | Known geometry and flow calibration |
| Ear reflectometry/tympanometry | Reflected sound; response under pressure | Portable middle-ear measurements | Coupling, calibration and pressure hardware |
| Oscillometry with force vibrometry | Pulse amplitude versus estimated applied pressure | Use built-in camera, motor and IMU | Per-phone force calibration and usable trials |
| Optical capillary-refill timing | Skin-color recovery after blanching | More reproducible timing/capture | Compression, lighting and skin variation |
| Thin-layer chromatography | Separated chemical spots | Guided field medicine-quality analysis | Solvents, standards and expertise |

## 1. Enzymatic and colorimetric assays

**Scientific connection:** a selected chemical reaction converts an otherwise invisible substance into a visible color. For urinary glucose, an enzyme reaction generates peroxide, which drives a color-producing reaction. Protein pads use different indicator chemistry. These are distinct assays, not interchangeable generic AI tests.

**Measured quantity/user:** a particular urinary analyte category or calibrated concentration; useful to people performing that test. Urinary glucose is not blood glucose. A protein-pad result is not a general kidney-function diagnosis.

**Accessibility/precedent:** strips and manual color charts already make testing inexpensive; dedicated readers and phone-reader research exist. A remaining opportunity might be timing, repeatability or usability, rather than inventing cheaper chemistry.

**Minimum instrument/reference:** commercial assay, compatible known controls, fixed light, phone camera, opaque holder; validate against prepared concentrations and an appropriate reference assay. Do not assume a strip chart provides fine quantitative resolution.

**Data/demo:** [published smartphone-reader resources](https://github.com/zyfccc/Smartphone-Modulated-Colorimetric-Reader-with-Color-Subtraction-IEEE-Sensors-2019) contain pH images, not validated glucose/protein images. No matching raw clinical image benchmark verified. A known-solution strip experiment could demonstrate capture and calibration without patient samples.

Sources: [Siemens reagent-strip instructions](https://content.doclib.siemens-healthineers.com/rest/v1/view?document-id=205015); [primary smartphone urinalysis study](https://www.sciencedirect.com/science/article/pii/S092540051400094X).

**Related discovery:** [Notre Dame PADs](https://padproject.nd.edu/) put multiple chemical reactions on a paper card to create medicine-dependent color patterns. [Their computer-vision project](https://cvrl.nd.edu/projects/?project_name=The+PAD+Project) already explores automated interpretation. This is an excellent precedent and also evidence that “AI reads a color barcode” alone is not a new contribution. Obtaining manufactured cards and controls is an unresolved prerequisite.

## 2. Lateral-flow immunoassays

**Scientific connection:** liquid wicks along a strip; target-dependent binding concentrates a colored or fluorescent label at a line. Sandwich and competitive formats can have different signal directions. The consumable supplies molecular specificity.

**Measured quantity/user:** assay-specific presence/category, or concentration only with a valid calibration; intended for users of that particular test.

**Accessibility/precedent:** home tests already make many binary results accessible. Potential improvements are reproducible optical readout and operation; commercial readers and open research tools already exist.

**Minimum instrument/reference:** intact assay and controls, fixed illumination/camera position, holder, correct read timing; assay-compatible target standards and reference method for quantitative claims.

**Data/demo:** [LFApp](https://github.com/fpaskali/LFApp) provides existing image/calibration workflows and a photo-box design. Its [primary paper](https://pmc.ncbi.nlm.nih.gov/articles/PMC8947044/) includes supplementary material. Relevance remains assay-specific. Printed lines demonstrate reader optics only; actual immunochemistry requires real assay controls.

**Judgment:** experimentally accessible if the chosen assay/controls are available; weak novelty until a concrete unmet reading/workflow problem is established.

## 3. Dental plaque fluorescence

**Scientific connection:** plaque-associated porphyrin molecules can emit red light under violet excitation. Suitable filtering separates that emission from reflected excitation light.

**Measured quantity/user:** an image of red-fluorescing regions and estimated visible-surface coverage, potentially useful for oral-care feedback. It does not identify a bacterial species or establish cavities/infection.

**Instrument/reference:** violet LEDs, driver, emission filter, controlled camera geometry and exposure; compare with disclosed-plaque images or a dental reference. Coverage of visible surfaces is not coverage of the whole mouth.

**Evidence/data:** a [MIT-associated primary study](https://pmc.ncbi.nlm.nih.gov/articles/PMC5745686/) reports a low-cost device and phone-adaptable design. Deidentified subject data are available on request; an open raw image benchmark was not confirmed. Construction links exist, but the linked legacy MIT guide failed to load in our check.

**Judgment:** visually compelling biology; obtaining suitable filters and establishing controlled illumination are the first gates. A bench fluorescence standard can demonstrate optics, not dental performance. Low-cost designs and commercial dental cameras already exist, so differentiation needs investigation.

## 4. Microscopic cell counting and motility

**Scientific connection:** appropriate optics resolve cells; object tracks yield displacement and movement statistics. A known observation volume enables concentration estimates.

**Measured quantity/user:** sperm concentration and motility in semen-analysis applications, not fertility itself. Conventional microscopy/computer-assisted semen analysis provides the precedent.

**Instrument/reference:** phone-compatible optics, fixed-depth calibrated sample chamber, stable illumination/focus and adequate frame rate. Compare counts and movement with a laboratory reference; sample preparation affects results.

**Evidence/data:** a [published smartphone system](https://pmc.ncbi.nlm.nih.gov/articles/PMC5701517/) demonstrates this approach. [VISEM-Tracking](https://zenodo.org/records/7293726) supplies downloadable labeled microscope videos; its [dataset paper](https://www.nature.com/articles/s41597-023-02173-4) specifies CC BY 4.0. Original VISEM is a separate dataset with different permission considerations. Neither is a phone-attachment validation set. No data downloaded.

**Judgment:** strong public-data route for tracking, substantial optical/sample burden for a live health measurement. Existing smartphone products mean the broad concept is already occupied. A bead/yeast demo verifies optics/tracking only; concentration still needs a known volume and spatial calibration.

## 5. Micro-mechanical clot detection

**Scientific connection:** clot formation changes how a mechanically driven tracer can move. A camera can detect that change rather than measure a chemical spectrum.

**Measured quantity/user:** clot time under defined assay conditions, with calibrated mapping to PT/INR for anticoagulation monitoring. A changed liquid viscosity alone is not a clotting assay.

**Instrument/reference:** phone vibration and camera, mechanically coupled holder/cup, tracer, standardized clotting reagent and appropriate specimen; clinical coagulation analyzer and reagent-specific calibration are needed for assay comparison.

**Evidence/data:** [original paper](https://www.nature.com/articles/s41467-022-28499-y); [authors' code](https://github.com/uw-x/blood_coagulation). Article source data and code are available; a ready labeled raw-video benchmark was not verified.

**Judgment:** an excellent example of surprising inexpensive transduction. A nonclinical viscosity-series demonstration could show particle-motion physics. Authentic assay replication has substantial specimen/reagent/reference dependencies. Conventional clot meters already exist; the phone adaptation is published prior work.

## 6. Acoustic airflow and spirometry

**Scientific connection:** flow through a designed vortex whistle changes tone frequency. Calibrating that relationship allows flow estimates; integrating flow gives volume. Direct turbulent breath audio is a different, more model-dependent approach.

**Measured quantity/user:** calibrated airflow/volume for respiratory measurements. A microphone alone records sound, not liters or pressure.

**Instrument/reference:** known whistle/mouthpiece geometry, phone microphone, repeatable position, appropriate mouthpieces; calibrated flow/volume source and reference spirometer. Phone microphone hardware and the exact attachment matter.

**Evidence/data:** [SpiroSmart](https://ubicomplab.cs.washington.edu/publications/spirosmart/); [primary vortex-whistle engineering study](https://www.jstage.jst.go.jp/article/sicetr1965/35/7/35_7_840/_article); [phone-whistle research](https://mynkgoel.github.io/publications/vortex_whistle/). No open matched raw airflow/audio training set confirmed. Ordinary lung-sound datasets are not equivalent.

**Judgment:** good physical interaction; controlled tone-versus-flow is a plausible mechanism experiment. FEV1/FVC requires adequate reference calibration. Existing peak-flow meters and spirometers mean affordability and accuracy must be compared against alternatives, not assumed.

## 7. Middle-ear acoustic measurements

**Scientific connection:** the ear's acoustic response changes with middle-ear/eardrum mechanics. Acoustic reflectometry probes reflected sound. Tympanometry additionally varies measured ear-canal pressure and records acoustic response across that sweep.

**Measured quantity/user:** a reflection feature associated with middle-ear status, or an acoustic-admittance-versus-pressure curve. These are different measurements.

**Instrument/reference:** reflection research uses phone sound/microphone and a controlled coupler. True tympanometry also requires pressure generation/sensing, calibrated audio and a sealed probe. Compare with clinical ear examination and appropriate commercial instruments.

**Evidence/data:** [UW project and source links](https://tymp.cs.washington.edu/); [reflection study](https://pubmed.ncbi.nlm.nih.gov/31092691/). Open hardware/code and paper results exist; a raw labeled phone-audio benchmark was not verified. Commercial reflectometers and tympanometers are existing precedents.

**Judgment:** conceptually surprising but demanding coupling and validation. A cavity/tube bench experiment demonstrates reflection physics only. A human ear-pressure prototype is not an appropriate shortcut to a weekend demonstration.

## 8. Oscillometry using phone force vibrometry

**Scientific connection:** applied finger force damps phone vibration; the IMU observes that response while the camera records a pulse signal. A research system combines estimated pressure and pulse amplitude into an oscillogram.

**Measured quantity/user:** candidate blood-pressure estimates from a calibrated physical model, compared with a reference cuff. The IMU does not directly measure blood pressure.

**Instrument/data:** phone motor, camera and IMU; model-specific force profiling against a force sensor and BP evaluation against a cuff. The [original paper](https://www.nature.com/articles/s41598-024-75025-9) makes data/code available on request, not as a verified downloadable benchmark. Its proof-of-concept excludes many unusable trials.

**Judgment:** especially relevant to the user's interest in repurposing built-in hardware. Actual sensor/control access and force calibration are major gates. Could investigate force-versus-damping on a bench first; that does not establish BP measurement. Existing cuffs are the practical comparator.

## 9. Optical capillary-refill timing

**Scientific connection:** compression temporarily blanches skin; after release, a camera tracks optical color recovery. A defined recovery threshold gives a time measurement.

**Measured quantity/user:** optical refill time, a peripheral-perfusion proxy; not direct blood flow or a general circulation diagnosis.

**Instrument/reference:** stable camera/light/exposure, consistent site and compression, release timestamp, ideally force control; compare with a standardized reference procedure or refill instrument. Temperature, pigmentation and movement can change results.

**Evidence/data:** [phone study](https://www.mdpi.com/2410-390x/10/1/15); [camera/polarizer research](https://arxiv.org/abs/2102.13611). No diverse downloadable raw phone-video dataset verified.

**Judgment:** relatively accessible for an optical time-series experiment, but clinical manual timing is already inexpensive. Reliability and standardization, rather than replacing an expensive machine, would be the plausible contribution. Broad skin-tone/perfusion validation remains unestablished for our setup.

## 10. Thin-layer chromatography for medicine quality

**Scientific connection:** a solvent carries mixture components across a stationary layer; substances separate into spots depending on their interactions with both. Compare with authentic standards under the same conditions.

**Measured quantity/user:** separation/spot patterns that help investigate medicine identity/content. A matching spot does not prove complete purity or drug quality.

**Instrument/reference:** plates, suitable solvent system, sample preparation and reference substances, visualization and camera. Reference testing may require a more capable laboratory method.

**Evidence/precedent:** [GPHF-Minilab](https://www.gphf.org/en/minilab/factsheet.htm) already packages this method for field medicine testing. Its [manufacturer manual example](https://www.gphf.org/images/downloads/DemoGPHFMinilabManualSuppl2011.pdf) supplies method-specific context. No matched open raw plate-image dataset verified in this pass.

**Judgment:** a real alternative to Peel's dissolution route. Camera analysis could help alignment and comparisons, but chemistry, standards and operator expertise remain essential. A separated-color teaching experiment demonstrates chromatography, not pharmaceutical quality.

## Negative/control candidate: refractometry

Refraction can estimate urine specific gravity through a calibrated refractive-index relationship. It is already a compact, simple clinical measurement; protein/glucose and other solutes can complicate interpretation. [UW laboratory method](https://dlmp.uw.edu/test-guide/view/USPG), [Mayo method note](https://renal.testcatalog.org/show/SGUR). No matching public sample dataset confirmed. A known-solution refractometry experiment is useful for calibration practice but currently offers a weak novelty/access thesis. No assumption of local low-cost availability is made.

## Synthesis: where to investigate next

- **Most direct optical biology effect:** plaque-associated fluorescence, conditional on optics/filter access.
- **Strongest verified labeled-video route:** cell motility tracking using VISEM-Tracking, with a major microscope-to-phone transfer gap.
- **Strongest built-in-hardware surprise:** vibrometric force estimation and micro-mechanical clot sensing; both have calibration dependencies that could dominate the weekend.
- **Most accessible controlled bench experiment:** an existing colorimetric assay with known controls; differentiation is the harder question.
- **Lower priority for our resources:** true tympanometry, clinical clot testing and medicine TLC unless the necessary apparatus/consumables and reference support become available.

These are research-priority judgments, not final project selections or clinical performance claims. The next pass should investigate the specific user/access gap and practical components for a small subset before designing a product.

No product code, firmware or CAD was authored. No packages installed, datasets downloaded, provider calls made, specimens collected, purchases made or deployments performed. The deliverable is this sourced method map.
