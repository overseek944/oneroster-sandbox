/**
 * OneRoster error envelope.
 *
 * The specification defines imsx_StatusInfo rather than a bare message, and a
 * consumer written against the spec will look for these fields. Returning
 * something ad hoc is the sort of detail that makes an implementation fail
 * conformance while looking fine in a browser.
 */
export interface StatusInfo {
  imsx_codeMajor: "success" | "processing" | "failure" | "unsupported";
  imsx_severity: "status" | "warning" | "error";
  imsx_description: string;
  imsx_CodeMinor: {
    imsx_codeMinorField: { imsx_codeMinorFieldName: string; imsx_codeMinorFieldValue: string }[];
  };
}

export function statusInfo(
  description: string,
  minor:
    | "invalid_filter_field"
    | "invalid_selection_field"
    | "invalid_sort_field"
    | "unauthorisedrequest"
    | "forbidden"
    | "unknownobject"
    | "server_busy"
    | "internal_server_error",
): StatusInfo {
  return {
    imsx_codeMajor: "failure",
    imsx_severity: "error",
    imsx_description: description,
    imsx_CodeMinor: {
      imsx_codeMinorField: [
        { imsx_codeMinorFieldName: "TargetEndSystem", imsx_codeMinorFieldValue: minor },
      ],
    },
  };
}
