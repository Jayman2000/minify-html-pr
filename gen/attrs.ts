import htmlData from "@wzlin/html-data";
import { writeFileSync } from "fs";
import { join } from "path";
import { RUST_OUT_DIR } from "./_common";

const rsTagAttr = ({
  boolean = false,
  caseInsensitive = false,
  collapse = false,
  defaultValue,
  redundantIfEmpty = false,
  trim = false,
}: {
  boolean?: boolean;
  caseInsensitive?: boolean;
  collapse?: boolean;
  defaultValue?: string;
  redundantIfEmpty?: boolean;
  trim?: boolean;
}) =>
  `
AttributeMinification {
    boolean: ${boolean},
    case_insensitive: ${caseInsensitive}, 
    collapse: ${collapse}, 
    default_value: ${
      defaultValue == undefined ? "None" : `Some(b"${defaultValue}")`
    },
    redundant_if_empty: ${redundantIfEmpty}, 
    trim: ${trim}, 
}
`;

let code = `
use lazy_static::lazy_static;
use std::collections::HashMap;
use crate::common::spec::tag::ns::Namespace;

pub struct AttributeMinification {
    pub boolean: bool,
    pub case_insensitive: bool,
    pub collapse: bool,
    pub default_value: Option<&'static [u8]>,
    pub redundant_if_empty: bool,
    pub trim: bool,
}

pub enum AttrMapEntry {
    AllNamespaceElements(AttributeMinification),
    SpecificNamespaceElements(HashMap<&'static [u8], AttributeMinification>),
}

pub struct ByNamespace {
    // Make pub so this struct can be statically created in gen/attrs.rs.
    pub html: Option<AttrMapEntry>,
    pub svg: Option<AttrMapEntry>,
}

impl ByNamespace {
    fn get(&self, ns: Namespace) -> Option<&AttrMapEntry> {
        match ns {
            Namespace::Html => self.html.as_ref(),
            Namespace::Svg => self.svg.as_ref(),
        }
    }
}

pub struct AttrMap(HashMap<&'static [u8], ByNamespace>);

impl AttrMap {
    pub const fn new(map: HashMap<&'static [u8], ByNamespace>) -> AttrMap {
        AttrMap(map)
    }

    pub fn get(&self, ns: Namespace, tag: &[u8], attr: &[u8]) -> Option<&AttributeMinification> {
        self.0.get(attr).and_then(|namespaces| namespaces.get(ns)).and_then(|entry| match entry {
            AttrMapEntry::AllNamespaceElements(min) => Some(min),
            AttrMapEntry::SpecificNamespaceElements(map) => map.get(tag),
        })
    }
}

`;

code += `
lazy_static! {
  pub static ref ATTRS: AttrMap = {
    let mut m = HashMap::<&'static [u8], ByNamespace>::new();
${[...Object.entries(htmlData.attributes)]
  .map(
    ([attr_name, namespaces]) => `    m.insert(b\"${attr_name}\", ByNamespace {
${(["html", "svg"] as const)
  .map(
    (ns) =>
      `      ${ns}: ` +
      (() => {
        const tagsMap = namespaces[ns];
        if (!tagsMap) {
          return "None";
        }
        const globalAttr = tagsMap["*"];
        if (globalAttr) {
          return `Some(AttrMapEntry::AllNamespaceElements(${rsTagAttr(
            globalAttr
          )}))`;
        }
        const entries = Object.entries(tagsMap);
        return `Some({
        let ${
          entries.length ? "mut" : ""
        } m = HashMap::<&'static [u8], AttributeMinification>::new();
${entries
  .map(
    ([tagName, tagAttr]) =>
      `        m.insert(b\"${tagName}\", ${rsTagAttr(tagAttr)});`
  )
  .join("\n")}
        AttrMapEntry::SpecificNamespaceElements(m)
      })`;
      })() +
      ","
  )
  .join("\n")}
    });

`
  )
  .join("")}
    AttrMap::new(m)
  };
}`;

writeFileSync(join(RUST_OUT_DIR, "attrs.rs"), code);
