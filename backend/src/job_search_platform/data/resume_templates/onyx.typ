// Onyx: single column, serif name, rule under the header, skills in two columns.
#import "common.typ": *
#show: setup
#set page(paper: "a4", margin: (x: 1.6cm, y: 1.4cm), footer: page-footer)

#text(font: serif, size: 24pt, weight: "bold")[#data.basics.name]
#if filled(data.basics.headline) { v(-6pt); text(size: 11pt, fill: muted)[#data.basics.headline] }
#v(2pt)
#text(size: 9pt)[#contacts().join(h(6pt) + text(fill: muted)[|] + h(6pt))]
#v(4pt)
#line(length: 100%, stroke: 0.8pt + muted)

#for name in data.order.filter(shown) {
  v(12pt, weak: true)
  heading-block[
    #text(font: serif, size: 12.5pt, weight: "bold", fill: accent)[#labels.at(name)]
  ]
  body(name)
}
