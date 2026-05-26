window.IDAT_JEWELRY_DATA = {
    metadata: {
        source: "IDAT-Jewelry (Itau BBA Consumer Brazil SF PDFs) and BigQuery aster.current_model",
        description: "YoY Growth (%) - IDAT Jewelry, Vivara and Life by Vivara",
        monthly: { start: "Jan-23", end: "Apr-26", count: 40 },
        quarterly: { start: "1Q23", end: "1Q26", count: 13 },
        bqTable: "aster-data-platform.constellation_vibe_coding.idat_jewelry_growth",
        derivation: "2023 monthly values back-derived from 3-year CAGR formula: YoY_M23 = (1+CAGR_M25)^3 / [(1+YoY_M24)(1+YoY_M25)] - 1"
    },
    monthly: {
        labels: [
            "Jan-23","Feb-23","Mar-23","Apr-23","May-23","Jun-23","Jul-23","Aug-23","Sep-23","Oct-23","Nov-23","Dec-23",
            "Jan-24","Feb-24","Mar-24","Apr-24","May-24","Jun-24","Jul-24","Aug-24","Sep-24","Oct-24","Nov-24","Dec-24",
            "Jan-25","Feb-25","Mar-25","Apr-25","May-25","Jun-25","Jul-25","Aug-25","Sep-25","Oct-25","Nov-25","Dec-25",
            "Jan-26","Feb-26","Mar-26","Apr-26"
        ],
        values: [
            2.3, -6.2, -4.3, -10.2, -3.5, -7.5, -4.9, -8.7, -4.1, -1.2, 7.2, 4.4,
            3.4, 7.0, 3.1, 20.7, 5.2, 15.7, 14.5, 18.4, 15.1, 18.2, 16.0, 19.1,
            11.0, 17.6, 8.8, 8.0, 16.0, 5.1, 5.4, 4.7, 16.3, 10.3, 14.8, 6.2,
            14.6, 2.6, 22.2, 11.3
        ]
    },
    quarterly: {
        labels: [
            "1Q23","2Q23","3Q23","4Q23",
            "1Q24","2Q24","3Q24","4Q24",
            "1Q25","2Q25","3Q25","4Q25",
            "1Q26"
        ],
        values: [
            -2.9, -6.8, -6.0, 3.8,
            4.4, 13.2, 16.1, 17.9,
            12.3, 9.8, 8.8, 9.9,
            13.4
        ]
    },
    quarterlyPeers: {
        labels: [
            "1Q23","2Q23","3Q23","4Q23",
            "1Q24","2Q24","3Q24","4Q24",
            "1Q25","2Q25","3Q25","4Q25",
            "1Q26"
        ],
        series: {
            idatJewelry: [ -2.9, -6.8, -6.0, 3.8, 4.4, 13.2, 16.1, 17.9, 12.3, 9.8, 8.8, 9.9, 13.4 ],
            vivaraSss: [ 6.2, 1.5, 2.8, 9.7, 7.7, 12.6, 14.0, 10.0, 11.3, 11.9, 14.7, 12.2, 10.8 ],
            lifeSss: [ 34.4, 37.6, 38.1, 24.7, 16.5, 16.7, 13.9, 11.7, 6.3, 9.1, 7.6, 9.1, 6.2 ],
            vivaraGrowthYoy: [ 6.1, 3.7, 7.9, 13.3, 12.6, 15.1, 15.6, 11.8, 13.0, 12.7, 15.3, 12.5, 11.0 ],
            lifeGrowthYoy: [ 149.9, 143.4, 101.7, 76.8, 59.5, 61.9, 52.8, 38.3, 31.1, 29.2, 21.3, 20.4, 19.0 ]
        }
    }
};
