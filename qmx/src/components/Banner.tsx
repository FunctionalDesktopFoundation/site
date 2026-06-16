export function Banner() {
    return (
        <div style={{
            fontFamily: "'Instrument Serif', serif",
            backgroundColor: '#222',
            width: '100%',
            padding: '20px',
            boxSizing: 'border-box',
            borderRadius: '10px',
            fontWeight: 900
        }}>
            Pardon our interruption. The FDF, like other open-source organizations, need <a href="https://blog.packagist.com/the-reality-of-funding-open-source/" target="_blank" style={{
                color: 'gray'
            }}>funding</a> to maintain our software libraries, actually fund our volunteers, and collaborate with your favorite desktop groups to improve their UX. Support us on <a href="http://liberapay.com/fdf" target="_blank" style={{
                color: 'yellow'
            }}>Liberapay</a>!
        </div>
    )
}