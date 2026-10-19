// Kakuna: single column, centred header, accent section titles over a full-width rule.
#import "common.typ": *
#show: setup
#set page(paper: "a4", margin: (x: 1.6cm, y: 1.4cm))

#align(center)[
  #text(font: serif, size: 22pt, weight: "bold")[#data.basics.name]
  #if filled(data.basics.headline) { v(-6pt); text(size: 10.5pt, fill: muted)[#data.basics.headline] }
  #v(0pt)
  #text(size: 9pt)[#contacts().join(h(5pt) + text(fill: accent)[•] + h(5pt))]
]

#for name in data.order.filter(shown) {
  block(breakable: true, above: 13pt, below: 0pt, width: 100%)[
    #align(center, text(size: 11.5pt, weight: "semibold", fill: accent)[#labels.at(name)])
    #v(-6pt)
    #line(length: 100%, stroke: 0.8pt + accent)
    #v(-2pt)
    #body(name)
  ]
}
