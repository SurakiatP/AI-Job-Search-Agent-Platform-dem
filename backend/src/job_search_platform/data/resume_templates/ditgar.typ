// Ditgar: two columns; an accent sidebar (contact, skills, short lists) on page 1, details on the right.
#import "common.typ": *
#show: setup
#let side-width = 6.4cm
#let tint = accent.lighten(88%)
// ponytail: Typst cannot widen a grid column per page, so from page 2 the right column keeps its width and
// the tint stops; a full-width continuation needs a manual page split.
#set page(paper: "a4", margin: (left: 0pt, right: 1.3cm, y: 1.2cm), footer: pad(left: side-width + 14pt, page-footer),
  background: context if counter(page).get().first() == 1 { place(left + top, rect(width: side-width, height: 100%, fill: tint)) })

#let side-names = ("skills", "languages", "certifications", "interests")
#let side = data.order.filter(n => n in side-names and shown(n))
#let main = data.order.filter(n => not (n in side-names) and shown(n))

#grid(columns: (side-width, 1fr), column-gutter: 14pt,
  [
    #block(width: 100%, fill: accent, inset: (x: 14pt, y: 14pt), below: 12pt)[
      #set text(fill: white)
      #show link: it => text(fill: white, it)
      #text(size: 17pt, weight: "bold")[#data.basics.name]
      #if filled(data.basics.headline) { linebreak(); text(size: 10pt)[#data.basics.headline] }
      #v(4pt)
      #set text(size: 8.6pt)
      #contacts(link-fill: white).join(linebreak())
    ]
    #block(inset: (x: 14pt))[
      #for name in side {
        block(breakable: true, below: 12pt, width: 100%)[
          #text(size: 11pt, weight: "bold", fill: accent)[#labels.at(name)]
          #v(-6pt)
          #line(length: 100%, stroke: 0.7pt + accent)
          #v(-2pt)
          #body(name, skill-columns: 1)
        ]
      }
    ]
  ],
  [
    #for name in main {
      heading-block[
        #text(size: 12pt, weight: "bold", fill: accent)[#labels.at(name)]
        #v(-6pt)
        #line(length: 100%, stroke: 0.7pt + accent.lighten(40%))
      ]
      body(name)
      v(13pt, weak: true)
    }
  ],
)
