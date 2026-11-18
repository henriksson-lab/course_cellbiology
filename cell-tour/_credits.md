All diagrams (`fig*.svg`) were drawn for this course and use the course colour key.
The photographs and micrographs below come from Wikimedia Commons; their licences
were checked on the file pages on 2026-11-18. Images were resized for the slides.

| File | What it shows | Author | Licence | Source |
|---|---|---|---|---|
| `img04-fluorescent-cells.jpg` | Bovine pulmonary artery endothelial cells; DAPI (nucleus, blue), tubulin (green), F-actin (red) | ImageJ sample image (NIH), made from a Molecular Probes demo slide | Public domain | <https://commons.wikimedia.org/wiki/File:FluorescentCells.jpg> |
| `img12-tem-lymphocyte.jpg` | Transmission electron micrograph of a human B lymphocyte | NIAID | CC BY 2.0 | <https://commons.wikimedia.org/wiki/File:Human_B_Lymphocyte_(28942386960).jpg> |
| `img13-yeast-dic.jpg` | Budding yeast, *Saccharomyces cerevisiae*, DIC microscopy | Masur | Public domain | <https://commons.wikimedia.org/wiki/File:S_cerevisiae_under_DIC_microscopy.jpg> |
| `img14-hela-living.jpg` | Living HeLa cells: nucleus, microtubules and mitochondria | 8x57is | CC BY-SA 4.0 | <https://commons.wikimedia.org/wiki/File:Multicolor_fluorescence_image_of_living_HeLa_cells.jpg> |
| `img15-intestinal-organoid.jpg` | Intestinal organoid grown from Lgr5+ stem cells (from St Johnston D, PLoS Biol 13(5): e1002149, 2015) | Meritxell Huch | CC BY 4.0 | <https://commons.wikimedia.org/wiki/File:Intestinal_organoid.PNG> |
| `img17-hela-hoechst.jpg` | HeLa cells stained with Hoechst 33258 (DNA) | TenOfAllTrades (English Wikipedia) | Public domain | <https://commons.wikimedia.org/wiki/File:HeLa_cells_stained_with_Hoechst_33258.jpg> |

Our diagrams in this unit: `fig02-course-map.svg`, `fig05-prokaryote-eukaryote.svg`,
`fig06-animal-cell.svg`, `fig08-topology.svg`, `fig09-membrane-orientation.svg`,
`fig10-scale-ladder.svg`, `fig16-hela-timeline.svg`. Numbers in the scale ladder and
on the "Numbers worth knowing" slide are standard order-of-magnitude values of the
kind collected in BioNumbers (<https://bionumbers.hms.harvard.edu>).

### Cell explorer (`explore.qmd`) and its slide screenshot

The electron micrograph and the organelle outlines in the [cell explorer](cell-tour/explore.qmd)
(and the screenshot `img06-cell-explorer.jpg` on the slide "Explore a real HeLa cell")
come from the OpenOrganelle dataset **jrc_hela-2**, "Interphase HeLa cell" (wild-type
HeLa, ATCC CCL-2; high-pressure frozen, freeze-substituted, imaged by FIB-SEM at
4 × 4 × 5.24 nm), Janelia Research Campus. Licence **CC BY 4.0**, checked on
2026-11-18 on both dataset DOIs and on the AWS Open Data Registry entry
(<https://registry.opendata.aws/janelia-cosem>).

- EM data: FIB-SEM Technology Group, CellMap Project Team, D. Bennett, H. Hess,
  A. Pasolli, G. Shtengel, A. Weigel, C. S. Xu et al. *Isotropic 3D electron
  microscopy reference data of wild-type, interphase HeLa cell (jrc_hela-2).*
  Janelia Research Campus, 2020. <https://doi.org/10.25378/janelia.13114211> (CC BY 4.0)
- Segmentations: L. Heinrich, D. Bennett, D. Ackerman, W. Park, J. Bogovic,
  N. Eckstein et al. *Automatic segmentation of organelles in isotropic electron
  microscopy data of wild-type, interphase HeLa cell (jrc_hela-2).* Janelia Research
  Campus, 2020. <https://doi.org/10.25378/janelia.13108343> (CC BY 4.0)
- Papers: Xu C. S. et al. *Nature* 599, 147–151 (2021),
  <https://doi.org/10.1038/s41586-021-03992-4>; Heinrich L. et al. *Nature* 599,
  141–146 (2021), <https://doi.org/10.1038/s41586-021-03977-3>.

Changes we made: one plane (y = 1.55 µm in the dataset coordinates, parallel to the
coverslip) resampled to 12 nm pixels, contrast-adjusted, with a 0.2 µm band of
damaged slices removed; outlines simplified from the machine segmentation, then
checked by eye, with some predictions removed and the centriole and envelope drawn
by hand (see `demos/data-scripts/` in the repository).
