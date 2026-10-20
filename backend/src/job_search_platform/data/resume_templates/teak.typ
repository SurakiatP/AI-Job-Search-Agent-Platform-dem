// Teak: an accent sidebar on page 1 with a round photo, name, contact and short lists; details on the right.
#import "common.typ": *
#show: setup
#let side-width = 6.2cm
#let tint = accent.lighten(90%)
// ponytail: like Ditgar, from page 2 the right column keeps its width and the sidebar tint stops.
#set page(paper: "a4", margin: (left: 0pt, right: 1.3cm, y: 1.2cm), footer: pad(left: side-width + 16pt, page-footer),
  background: context if counter(page).get().first() == 1 { place(left + top, rect(width: side-width, height: 100%, fill: tint)) })

#let side-names = ("skills", "languages", "certifications", "interests", "personal")
#let side = data.order.filter(n => n in side-names and shown(n))
#let main = data.order.filter(n => not (n in side-names) and shown(n))

#grid(columns: (side-width, 1fr), column-gutter: 16pt,
  [
    #block(width: 100%, fill: accent, inset: (x: 16pt, y: 16pt), below: 14pt)[
      #set text(fill: white)
      #show link: it => text(fill: white, it)
      #if has-photo { align(center, photo(3.1cm, round: true, ring: 2.5pt + white)); v(6pt) }
      #align(if has-photo { center } else { left })[
        #text(size: 16pt, weight: "bold")[#data.basics.name]
        #if filled(data.basics.headline) { linebreak(); text(size: 9.6pt)[#data.basics.headline] }
      ]
      #v(6pt)
      #set text(size: 8.6pt)
      #contacts(link-fill: white).join(linebreak())
    ]
    #block(inset: (x: 16pt))[
      #for name in side {
        block(breakable: true, below: 13pt, width: 100%)[
          #text(size: 10.5pt, weight: "bold", fill: accent)[#labels.at(name)]
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
