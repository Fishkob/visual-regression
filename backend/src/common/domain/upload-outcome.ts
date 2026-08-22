export enum ComparisonOutcome {
  IDENTICAL = 'identical',
  BASELINE_CREATED = 'baseline_created',
  COMPARISON_QUEUED = 'comparison_queued',
}

export enum ComparisonErrorCode {
  IMAGE_DIFFERENCE = 'image_difference',
  PDF_DIFFERENCE = 'pdf_difference',
}
